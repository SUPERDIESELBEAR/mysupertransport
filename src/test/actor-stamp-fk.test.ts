import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUTH_UID,
  PROFILE_ID,
  PROFILE_FK_COLUMNS,
  actorExpressionFor,
  actorExpressionInBody,
  createPgFake,
  functionBody,
} from './helpers/pgFake';
import { resolveMigrationFunctions, stripComments } from './helpers/migrationFunctions';

/**
 * ACTOR STAMPING: auth uid vs profile id.
 *
 * `created_by` / `updated_by` / `changed_by` on the TMS tables are foreign keys
 * to `profiles(id)`. `auth.uid()` is the auth USER id, a different uuid. Writing
 * one where the other is required raises 23503 at insert time — which is how
 * "File these as the load's reference numbers" failed on ST26034 with the whole
 * suite green.
 *
 * The suite was green because every existing test either mocks the actor or
 * never reaches a foreign key. So this file works two angles:
 *
 *   1. STATIC — no SQL function may assign `auth.uid()` to a column that points
 *      at `profiles(id)`, and no client write may send one.
 *   2. DRIVEN — the real save path runs against a fake that enforces the FK and
 *      takes its actor from the checked-in SQL's own text.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));

beforeEach(() => fake.reset());

/* ------------------------------------------------------------------ */
/* 1. Static: the SQL side                                             */
/* ------------------------------------------------------------------ */

describe('SQL functions resolve the actor server-side', () => {
  const fns = [...resolveMigrationFunctions().values()];

  it('no resolved function stamps auth.uid() into a profiles(id) column', () => {
    const offenders: string[] = [];
    for (const fn of fns) {
      const body = stripComments(fn.block);
      for (const [table, cols] of Object.entries(PROFILE_FK_COLUMNS)) {
        if (!new RegExp(`\\b${table}\\b`, 'i').test(body)) continue;
        for (const col of cols) {
          const found = actorExpressionInBody(body, table, col);
          if (found?.kind === 'auth_uid') {
            offenders.push(`${fn.name} → ${table}.${col} = ${found.expr}`);
          }
        }
      }
    }
    expect(offenders, 'use current_profile_id(), not auth.uid()').toEqual([]);
  });

  it.each([
    ['file_load_references', 'load_change_history', 'changed_by'],
    ['file_load_references', 'load_references', 'created_by'],
    ['set_load_verbatim_verification', 'loads', 'updated_by'],
  ])('%s stamps %s.%s from current_profile_id()', (fn, table, col) => {
    expect(functionBody(fn), `${fn} is not defined in the migrations`).toBeTruthy();
    expect(actorExpressionFor(fn, table, col)?.kind).toBe('profile');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Static: the client side                                          */
/* ------------------------------------------------------------------ */

describe('client writes do not carry an actor id', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'test' && e.name !== '__tests__') walk(p); }
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);

  const AUTH_SHAPED = /auth\.getUser|\buser\??\.id\b|\bsession\??\.user|\buserId\b|\bauthUid\b/;

  it('no insert/update on a profiles-FK table sets an actor column from the auth user', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [table, cols] of Object.entries(PROFILE_FK_COLUMNS)) {
        const fromRe = new RegExp(`from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g');
        let m: RegExpExecArray | null;
        while ((m = fromRe.exec(text)) !== null) {
          const chunk = text.slice(m.index, m.index + 1200);
          if (!/\.(insert|update|upsert)\s*\(/.test(chunk)) continue;
          for (const col of cols) {
            const assign = new RegExp(`\\b${col}\\s*:\\s*([^,\\n}]+)`).exec(chunk);
            if (assign && AUTH_SHAPED.test(assign[1])) {
              offenders.push(
                `${path.relative(SRC, file)}: ${table}.${col} = ${assign[1].trim()}`,
              );
            }
          }
        }
      }
    }
    expect(
      offenders,
      'the database resolves the actor with current_profile_id(); do not send one from the client',
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Driven: the real save path against FK enforcement                */
/* ------------------------------------------------------------------ */

describe('filing a reference baseline through the real save path', () => {
  const refs = [
    {
      reference_class: 'pickup_number', label: 'Pickup Number', value: 'IX00286060',
      citations: [{ stopSequence: 1, printedLabel: 'PU#' }],
    },
    { reference_class: 'bol', label: 'BOL', value: '562117', citations: [] },
  ];

  it('writes references, citations and the history entry stamped with the profile id', async () => {
    const { fileReferenceBaseline } = await import('@/lib/loadReferences');

    await fileReferenceBaseline({
      loadId: 'load-1',
      refs: refs as never,
      documentId: 'doc-1',
      documentLabel: 'revised rate confirmation blue-grace.pdf',
    });

    expect(fake.tables.load_references).toHaveLength(2);
    expect(fake.tables.load_reference_citations).toHaveLength(1);
    expect(fake.tables.load_change_history).toHaveLength(1);

    // The stamp is the profile id, not the auth uid. This is the assertion the
    // production failure would have tripped.
    expect(fake.tables.load_change_history[0].changed_by).toBe(PROFILE_ID);
    expect(fake.tables.load_change_history[0].changed_by).not.toBe(AUTH_UID);
    fake.tables.load_references.forEach(r => expect(r.created_by).toBe(PROFILE_ID));
  });

  it('is one transaction: a failing history insert leaves no reference rows behind', async () => {
    const { fileReferenceBaseline } = await import('@/lib/loadReferences');

    // Remove the profile so the actor no longer resolves — the same shape as
    // the production 23503. ST26034 was left with five reference rows and no
    // history entry because the write was two round trips; it must not be.
    fake.tables.profiles.length = 0;

    await expect(fileReferenceBaseline({
      loadId: 'load-1',
      refs: refs as never,
      documentId: 'doc-1',
      documentLabel: 'revised rate confirmation blue-grace.pdf',
    })).rejects.toBeTruthy();

    expect(fake.tables.load_references).toHaveLength(0);
    expect(fake.tables.load_reference_citations).toHaveLength(0);
    expect(fake.tables.load_change_history).toHaveLength(0);
  });
});

describe('filing a verbatim verification through the real save path', () => {
  it('stamps loads.updated_by with the profile id', async () => {
    const { saveVerbatimVerification } = await import('@/lib/verbatimPersist');
    await saveVerbatimVerification('load-1', [
      { field: 'special_instructions_verbatim', verdict: 'verified' },
    ] as never);
    expect(fake.tables.loads[0].updated_by).toBe(PROFILE_ID);
  });
});
