import { describe, expect, it } from 'vitest';
import { resolveMigrationFunctions, stripComments } from './helpers/migrationFunctions';
import { ISOLATION_FIXTURES } from './fixtures/notificationIsolationFixtures';

/**
 * A notification must never be able to revoke the work that triggered it.
 *
 * `notify_driver_equipment_sheet_ready` inserted a notification with a
 * priority the check constraint refuses. Because the insert was not isolated,
 * every coordinator save that completed a driver's verification set was
 * rolled back with it — for weeks, silently. `notify_rods_correction_request`
 * had the identical shape and took the staff correction request with it.
 *
 * AFTER buys nothing: an AFTER trigger that raises aborts the statement that
 * fired it exactly like a BEFORE trigger. The only protection is a plpgsql
 * EXCEPTION handler, which runs the enclosing block in its own
 * subtransaction.
 *
 * THE RULE
 * --------
 * Every `INSERT INTO public.notifications` must sit inside a block that has
 * an EXCEPTION handler. In practice call sites should use
 * `public.try_notify(...)` and hold no raw insert at all; the two functions
 * that legitimately own a raw insert are allowlisted below.
 */

/** Functions permitted to hold a raw notification insert. Shrink-only. */
const OWNERS = new Set([
  'public.try_notify',
  'public.log_notification_delivery_failure',
]);

interface Finding {
  /** Character offset of the insert within the body. */
  at: number;
  protectedByHandler: boolean;
}

/**
 * Blanks out string literals and dollar-quoted strings so a `BEGIN`, `END`,
 * or the phrase `INSERT INTO public.notifications` inside quotes cannot move
 * the parser. Length is preserved so offsets stay meaningful.
 */
function blankLiterals(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      for (let k = i; k <= Math.min(j, sql.length - 1); k++) out[k] = ' ';
      i = j + 1;
      continue;
    }
    const dollar = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      for (let k = i; k < stop; k++) out[k] = ' ';
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * Walks the block structure of a plpgsql body and reports, for every
 * notification insert, whether some enclosing block carries an EXCEPTION
 * handler.
 *
 * `BEGIN` opens a frame. A bare `END` (not `END IF` / `END LOOP` / `END CASE`)
 * closes one. `EXCEPTION` marks the innermost open frame as handled — it is
 * seen after the insert, so frames are resolved at the end rather than
 * inspected in place.
 */
/**
 * A resolved block is `CREATE FUNCTION ... AS $function$ <body> $function$`.
 * The body has to be unwrapped before literals are blanked, or the outer
 * dollar-quote swallows the entire function and the parser finds nothing —
 * which is exactly the silent-no-match failure the meta-assertions guard.
 */
export function unwrapBody(block: string): string {
  const m = block.match(/AS\s+(\$[a-zA-Z_]*\$)([\s\S]*)\1\s*;?\s*$/i);
  return m ? m[2] : block;
}

export function findNotificationInserts(rawBody: string): Finding[] {
  const body = blankLiterals(stripComments(rawBody));

  interface Frame { kind: 'block' | 'case'; id: number; handled: boolean }
  // One stack for both constructs. A `CASE ... END` *expression* closes with a
  // bare END, indistinguishable from a block's END unless CASE is tracked —
  // and treating it as a block close pops the real enclosing block early,
  // reporting isolated inserts as bare. That false positive is worse than a
  // miss: it trains people to ignore the guard.
  const stack: Frame[] = [];
  const byId = new Map<number, Frame>();
  let nextId = 0;

  const pending: Array<{ at: number; stack: number[] }> = [];

  const token = /\b(BEGIN|CASE|EXCEPTION|END)\b|INSERT\s+INTO\s+(?:public\s*\.\s*)?notifications\b/gi;
  let m: RegExpExecArray | null;
  while ((m = token.exec(body)) !== null) {
    const word = (m[1] ?? '').toUpperCase();

    if (!word) {
      pending.push({
        at: m.index,
        stack: stack.filter((f) => f.kind === 'block').map((f) => f.id),
      });
      continue;
    }

    if (word === 'BEGIN' || word === 'CASE') {
      // `IF`/`LOOP` need no entry: they close with `END IF` / `END LOOP`,
      // which is skipped below. `CASE` needs one because the expression form
      // closes with a bare `END`.
      const frame: Frame = {
        kind: word === 'BEGIN' ? 'block' : 'case',
        id: nextId++,
        handled: false,
      };
      stack.push(frame);
      byId.set(frame.id, frame);
      continue;
    }

    if (word === 'EXCEPTION') {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === 'block') { stack[i].handled = true; break; }
      }
      continue;
    }

    // END: `END IF` / `END LOOP` close constructs that were never pushed.
    const after = body.slice(m.index + 3, m.index + 12).trim().toUpperCase();
    if (/^(IF|LOOP)\b/.test(after)) continue;
    if (/^CASE\b/.test(after)) {
      // Statement form: close the nearest open CASE.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === 'case') { stack.splice(i, 1); break; }
      }
      continue;
    }
    stack.pop();
  }

  return pending.map((p) => ({
    at: p.at,
    protectedByHandler: p.stack.some((id) => byId.get(id)?.handled === true),
  }));
}

describe('notification insert isolation', () => {
  describe('the parser itself', () => {
    for (const fx of ISOLATION_FIXTURES) {
      it(`${fx.name} — finds ${fx.inserts}, offends: ${fx.offends}`, () => {
        const found = findNotificationInserts(fx.body);
        // Meta-assertion: a parser that stops matching must fail, not pass.
        expect(found.length).toBe(fx.inserts);
        const offends = found.some((f) => !f.protectedByHandler);
        expect(offends).toBe(fx.offends);
      });
    }

    it('locates at least one insert across the positive fixtures', () => {
      const total = ISOLATION_FIXTURES.filter((f) => f.inserts > 0)
        .reduce((n, f) => n + findNotificationInserts(f.body).length, 0);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('the live migration set', () => {
    const resolved = [...resolveMigrationFunctions().values()];

    it('resolves a non-empty function set', () => {
      expect(resolved.length).toBeGreaterThan(0);
    });

    it('finds notification inserts somewhere (the matcher still matches)', () => {
      const total = resolved.reduce(
        (n, f) => n + findNotificationInserts(unwrapBody(f.block)).length, 0);
      expect(total).toBeGreaterThan(0);
    });

    it('every notification insert outside try_notify is isolated', () => {
      const offenders: string[] = [];
      for (const fn of resolved) {
        if (OWNERS.has(fn.name)) continue;
        const found = findNotificationInserts(unwrapBody(fn.block));
        const bare = found.filter((f) => !f.protectedByHandler).length;
        if (bare > 0) offenders.push(`${fn.signature} (${bare} in ${fn.file})`);
      }
      expect(offenders).toEqual([]);
    });
  });
});