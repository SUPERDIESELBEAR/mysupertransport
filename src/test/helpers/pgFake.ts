import { resolveMigrationFunctions, stripComments } from './migrationFunctions';

/**
 * A Postgres-SHAPED fake for the actor-stamping tests.
 *
 * Two things make it different from the hand-written mocks the suite already
 * has, and both are the point:
 *
 * 1. It enforces the real `profiles(id)` foreign keys. Passing an auth uid
 *    where a profile id is required raises 23503 here, exactly as the database
 *    does. The existing mocks accept any uuid, which is why a write that
 *    stamped `auth.uid()` passed its unit test and failed in production.
 * 2. Its RPC behaviour is DERIVED FROM THE CHECKED-IN SQL, not reimplemented in
 *    TypeScript. It reads the migration set, resolves each function to its
 *    final definition, and works out which expression that definition assigns
 *    to each actor column. So the fake tells the truth about what the database
 *    will do, and a regression in the SQL fails the test.
 *
 * The seeded profile deliberately has `id` !== `user_id`. A fake where the two
 * coincide cannot detect the bug this file exists for.
 */

export const AUTH_UID = '5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe';
export const PROFILE_ID = 'b1e0f0aa-1111-4444-8888-0c0ffee00001';

export interface Row { [k: string]: unknown }

/** Columns whose value must be a `profiles.id`. */
export const PROFILE_FK_COLUMNS: Record<string, string[]> = {
  load_change_history: ['changed_by'],
  load_references: ['created_by'],
  load_status_history: ['changed_by'],
  loads: ['created_by', 'updated_by', 'dispatcher_id'],
  parser_diagnostics: ['created_by', 'resolved_by'],
};

export class FkViolation extends Error {
  code = '23503';
  constructor(table: string, column: string, value: unknown) {
    super(
      `insert or update on table "${table}" violates foreign key constraint ` +
        `"${table}_${column}_fkey" — Key (${column})=(${String(value)}) is not present in table "profiles".`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Reading the actor expression out of the checked-in SQL              */
/* ------------------------------------------------------------------ */

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export type ActorKind = 'profile' | 'auth_uid' | 'unknown';

export function classifyActorExpression(expr: string): ActorKind {
  const e = expr.toLowerCase();
  if (/current_profile_id\s*\(/.test(e)) return 'profile';
  if (/auth\.uid\s*\(/.test(e)) return 'auth_uid';
  return 'unknown';
}

/** Body of a function, resolved to its LAST definition across the migrations. */
export function functionBody(name: string): string | null {
  const hit = [...resolveMigrationFunctions().values()].find(
    f => f.name === `public.${name}` || f.name === name,
  );
  return hit ? stripComments(hit.block) : null;
}

/**
 * How a SQL function stamps `column` on `table` — read from its own text.
 * Covers `INSERT INTO t (cols) VALUES (exprs)` and `UPDATE t SET col = expr`.
 */
export function actorExpressionFor(
  fnName: string,
  table: string,
  column: string,
): { kind: ActorKind; expr: string } | null {
  const body = functionBody(fnName);
  if (!body) return null;

  const insertRe = new RegExp(
    `insert\\s+into\\s+(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\)\\s*values\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(body)) !== null) {
    const cols = splitTop(m[1]).map(c => c.trim().toLowerCase());
    const vals = splitTop(m[2]);
    const at = cols.indexOf(column);
    if (at >= 0 && vals[at] !== undefined) {
      const expr = vals[at].trim();
      return { kind: classifyActorExpression(expr), expr };
    }
  }

  const setRe = new RegExp(`\\b${column}\\s*=\\s*([^,\\n]+)`, 'gi');
  const updateSection = body.slice(body.toLowerCase().indexOf(`update public.${table}`));
  const s = setRe.exec(updateSection);
  if (s) return { kind: classifyActorExpression(s[1]), expr: s[1].trim() };

  return null;
}

/** Turns the SQL's actor expression into the uuid the fake will store. */
export function actorValue(kind: ActorKind): string | null {
  if (kind === 'profile') return PROFILE_ID;
  if (kind === 'auth_uid') return AUTH_UID;
  return null;
}

/* ------------------------------------------------------------------ */
/* The client                                                          */
/* ------------------------------------------------------------------ */

export interface PgFake {
  tables: Record<string, Row[]>;
  client: unknown;
  reset(): void;
}

export function createPgFake(): PgFake {
  const tables: Record<string, Row[]> = {
    profiles: [],
    load_stops: [],
    load_references: [],
    load_reference_citations: [],
    load_change_history: [],
    loads: [],
    parser_diagnostics: [],
  };

  const seed = () => {
    Object.keys(tables).forEach(k => { tables[k].length = 0; });
    tables.profiles.push({ id: PROFILE_ID, user_id: AUTH_UID, full_name: 'Test Dispatcher' });
    tables.loads.push({ id: 'load-1', load_number: 'TEST-1' });
    tables.load_stops.push(
      { id: 'stop-a', load_id: 'load-1', stop_sequence: 1 },
      { id: 'stop-b', load_id: 'load-1', stop_sequence: 2 },
    );
  };
  seed();

  const enforce = (table: string, row: Row) => {
    for (const col of PROFILE_FK_COLUMNS[table] ?? []) {
      const v = row[col];
      // A null actor is allowed everywhere: the FK never rejects a null, and a
      // diagnostic must degrade to an unattributed row rather than not writing.
      if (v == null) continue;
      if (!tables.profiles.some(p => p.id === v)) throw new FkViolation(table, col, v);
    }
  };

  const insertRows = (table: string, payload: Row | Row[], idPrefix = 'row') => {
    const list = Array.isArray(payload) ? payload : [payload];
    const written: Row[] = [];
    list.forEach((p, i) => {
      enforce(table, p);
      const row = { id: `${idPrefix}-${tables[table].length + i + 1}`, ...p };
      tables[table].push(row);
      written.push(row);
    });
    return written;
  };

  /** Mimics the RPCs, taking the actor from the SQL's own text. */
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    try {
      if (fn === 'file_load_references' || fn === 'record_load_reference_baseline') {
        const refs = (args.p_refs ?? []) as {
          reference_class: string; label: string; value: string; value_key: string;
          citations?: { stopSequence: number; printedLabel?: string | null }[];
        }[];

        // The single-transaction contract: references, citations and the
        // history entry either all land or none do.
        const snapshot = JSON.parse(JSON.stringify(tables));
        try {
          if (fn === 'file_load_references') {
            const created = actorExpressionFor(fn, 'load_references', 'created_by');
            const actor = actorValue(created?.kind ?? 'unknown');
            refs.forEach(r => {
              const existing = tables.load_references.find(
                x => x.load_id === args.p_load_id
                  && x.reference_class === r.reference_class
                  && x.value_key === r.value_key,
              );
              const row: Row = {
                load_id: args.p_load_id,
                reference_class: r.reference_class,
                label: r.label,
                value: r.value,
                value_key: r.value_key,
                source: args.p_source ?? 'rate_confirmation',
                created_by: actor,
              };
              enforce('load_references', row);
              const refId = existing
                ? (Object.assign(existing, row), existing.id as string)
                : (insertRows('load_references', row, 'ref')[0].id as string);

              for (let i = tables.load_reference_citations.length - 1; i >= 0; i -= 1) {
                if (tables.load_reference_citations[i].reference_id === refId) {
                  tables.load_reference_citations.splice(i, 1);
                }
              }
              (r.citations ?? []).forEach(c => {
                insertRows('load_reference_citations', {
                  reference_id: refId,
                  load_stop_id: tables.load_stops.find(
                    s => s.load_id === args.p_load_id && s.stop_sequence === c.stopSequence,
                  )?.id ?? null,
                  stop_sequence: c.stopSequence,
                  printed_label: (c.printedLabel ?? '').trim() || r.label,
                }, 'cite');
              });
            });
          }

          if (args.p_summary) {
            const changed = actorExpressionFor(fn, 'load_change_history', 'changed_by');
            insertRows('load_change_history', {
              load_id: args.p_load_id,
              field_path: 'references.baseline',
              new_value: args.p_summary,
              change_source: 'reference_baseline',
              changed_by: actorValue(changed?.kind ?? 'unknown'),
            }, 'hist');
          }
        } catch (err) {
          Object.keys(tables).forEach(k => {
            tables[k].length = 0;
            (snapshot[k] as Row[]).forEach(r => tables[k].push(r));
          });
          throw err;
        }
        return { data: null, error: null };
      }

      if (fn === 'set_load_verbatim_verification') {
        const upd = actorExpressionFor(fn, 'loads', 'updated_by');
        const load = tables.loads.find(l => l.id === args.p_load_id);
        if (!load) throw new Error('load not found');
        const next = { ...load, updated_by: actorValue(upd?.kind ?? 'unknown') };
        enforce('loads', next);
        Object.assign(load, next, { verbatim_verification: args.p_records });
        return { data: null, error: null };
      }

      return { data: null, error: { message: `unhandled rpc ${fn}`, code: 'P0001' } };
    } catch (err) {
      const e = err as FkViolation;
      return { data: null, error: { message: e.message, code: e.code ?? 'P0001', details: '', hint: '' } };
    }
  };

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: AUTH_UID } }, error: null }),
    },
    rpc,
    from(table: string) {
      const rows = (tables[table] ??= []);
      const api = {
        _filters: [] as ((r: Row) => boolean)[],
        select(cols?: string) {
          const embedCitations = !!cols && cols.includes('load_reference_citations(');
          const list = rows
            .filter(r => this._filters.every(f => f(r)))
            .map(r => (embedCitations
              ? {
                ...r,
                load_reference_citations: tables.load_reference_citations
                  .filter(c => c.reference_id === r.id)
                  .map(c => ({ stop_sequence: c.stop_sequence, printed_label: c.printed_label })),
              }
              : r));
          const resolved = (l: Row[]): unknown => Object.assign(
            Promise.resolve({ data: l, error: null }),
            {
              eq: (c: string, v: unknown) => resolved(l.filter(r => r[c] === v)),
              is: (c: string, v: unknown) => resolved(l.filter(r => (r[c] ?? null) === v)),
              order: () => resolved(l),
              limit: (n: number) => resolved(l.slice(0, n)),
            },
          );
          return resolved(list);
        },
        eq(col: string, val: unknown) { this._filters.push(r => r[col] === val); return this; },
        in(col: string, vals: unknown[]) { this._filters.push(r => vals.includes(r[col])); return this; },
        insert(payload: Row | Row[]) {
          try {
            insertRows(table, payload);
            return Promise.resolve({ data: null, error: null });
          } catch (err) {
            const e = err as FkViolation;
            return Promise.resolve({ data: null, error: { message: e.message, code: e.code } });
          }
        },
        update(patch: Row) {
          const self = api;
          return {
            eq(col: string, val: unknown) {
              try {
                rows.filter(r => r[col] === val).forEach(r => {
                  const next = { ...r, ...patch };
                  enforce(table, next);
                  Object.assign(r, patch);
                });
                void self;
                return Promise.resolve({ data: null, error: null });
              } catch (err) {
                const e = err as FkViolation;
                return Promise.resolve({ data: null, error: { message: e.message, code: e.code } });
              }
            },
          };
        },
        delete() {
          return {
            in(col: string, vals: unknown[]) {
              for (let i = rows.length - 1; i >= 0; i -= 1) {
                if (vals.includes(rows[i][col])) rows.splice(i, 1);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
      return api;
    },
  };

  return { tables, client, reset: seed };
}
