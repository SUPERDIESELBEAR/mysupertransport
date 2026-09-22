/**
 * P36 — an agreement's status only moves forward; only the owner may move it back.
 *
 * The bypass (proved live 2026-09-22): the ICA builder wrote `status: 'draft'` on
 * EVERY update, so staff could save a sent agreement back to draft and then change
 * the owner-only percentage freely — and a contract already with the driver
 * silently became an unsent draft.
 *
 * Two arms:
 *   1. SOURCE GUARD — the builder must not write `status` on an update; only the
 *      insert path may set 'draft'.
 *   2. MIGRATION GUARD — the database trigger exists, is ordered after the 0027
 *      guards, names the permission, and exempts service-role callers.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUILDER = resolve(process.cwd(), 'src/components/ica/ICABuilderModal.tsx');
const MIGRATION = resolve(
  process.cwd(),
  'drizzle/migrations/0029_agreement_status_forward_only.sql',
);

describe('ICA builder never writes status on update', () => {
  const src = readFileSync(BUILDER, 'utf8');

  it("no longer carries status: 'draft' in an update payload", () => {
    // The only remaining 'draft' writes are on the insert paths, spread inline.
    const draftWrites = src.match(/status:\s*'draft'/g) ?? [];
    expect(draftWrites).toHaveLength(2);
    for (const line of src.split('\n')) {
      if (/status:\s*'draft'/.test(line)) {
        expect(line).toContain('insertPayload');
      }
    }
  });

  it('still moves the status forward when the agreement is sent', () => {
    expect(src).toContain("status: 'sent_to_operator'");
  });

  it('names P36 where the status write was removed', () => {
    expect(src).toContain('P36');
  });
});

describe('0029 forward-only status trigger', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('creates the guard as a BEFORE UPDATE trigger on ica_contracts', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.guard_ica_status_forward_only()');
    expect(sql).toMatch(/CREATE TRIGGER ab_guard_ica_status_forward_only\s+BEFORE UPDATE ON public\.ica_contracts/);
  });

  it('is named to fire after the 0023 and 0027 guards', () => {
    expect(sql).toContain('aa_guard_ica_contract_terms');
    expect(sql).toContain('ab_guard_ica_linehaul_split');
  });

  it('requires driver_pay.change to move a status backward', () => {
    expect(sql).toContain("public.has_permission(auth.uid(), 'driver_pay.change')");
    expect(sql).toContain("USING ERRCODE = '42501'");
  });

  it('ranks the four live statuses in order', () => {
    const order = ['draft', 'sent_to_operator', 'fully_executed', 'complete'];
    let cursor = 0;
    for (const s of order) {
      const at = sql.indexOf(`WHEN '${s}'`, cursor);
      expect(at).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it('exempts service-role callers, per design (d)', () => {
    expect(sql).toContain('auth.uid() IS NULL');
  });

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toMatch(/SET search_path TO 'public', 'extensions'/);
  });

  it('carries an undo comment', () => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS ab_guard_ica_status_forward_only');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.guard_ica_status_forward_only');
  });
});
