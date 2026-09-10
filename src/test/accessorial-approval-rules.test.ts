import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 5, PASS 5 — the late accessorial can now be reached, and the two
 * rules that make reaching it safe.
 *
 * 1. THE DISPATCHER APPROVAL LIMIT IS READ, NEVER PASSED. A limit the caller
 *    supplies is a limit the caller can change, so the function reads
 *    settlement_settings itself. Asserted against the live body.
 * 2. PROOF IS TOTAL. Every charge type maps to a proof kind; an unlisted type
 *    falls back to any_document rather than becoming unsubmittable. The
 *    mapping itself is PROPOSED BY THE BUILD, not stated by the owner.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('accessorial approval rule checks did not run', [
    'No PGHOST, so the live function bodies and the proof mapping could not',
    'be read. The source-level reachability checks below still ran.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live function bodies could not be read',
  details: ['Only this file asserts the approval limit and proof rules.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}
const body = (name: string) =>
  psql(`select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${name}'`).join('\n');

const CHARGE_TYPES = ['linehaul','fsc','detention','stopoff','lumper','layover','tonu','reimbursement','other'];

describe('late accessorial approval rules (live)', () => {
  itLive('approve reads the dispatcher limit itself and takes no limit argument', () => {
    const def = body('approve_accessorial_adjustment');
    expect(def).toContain('settlement_settings');
    expect(def).toContain('dispatcher_accessorial_approval_limit');
    // Exactly two arguments: the adjustment and the reason. No third.
    const args = psql(`select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_accessorial_adjustment'`)[0];
    expect(args).toBe('p_id uuid, p_reason text');
  });

  itLive('the limit lives on settlement_settings and is nullable', () => {
    const [row] = psql(`select is_nullable from information_schema.columns where table_schema='public' and table_name='settlement_settings' and column_name='dispatcher_accessorial_approval_limit'`);
    expect(row).toBe('YES');
  });

  itLive('every charge type maps to a proof kind, and an unknown one still maps', () => {
    // EXECUTE is not granted to the test role — the mapping is an internal
    // helper, not a client surface — so the totality is read from the body.
    const def = body('accessorial_proof_kind');
    expect(def).toContain("WHEN 'detention'     THEN 'broker_agreement'");
    expect(def).toContain("WHEN 'lumper'        THEN 'receipt'");
    // The ELSE is the whole point: an unlisted charge type gets a proof kind
    // rather than becoming unsubmittable. A category has vanished this way before.
    expect(def).toContain("ELSE 'any_document'");
    for (const t of CHARGE_TYPES) {
      const mapped = def.includes(`WHEN '${t}'`);
      expect(mapped || def.includes("ELSE 'any_document'")).toBe(true);
    }
  });

  itLive('submission refuses an adjustment with no proof, and tells whoever gets notified', () => {
    const def = body('submit_accessorial_adjustment');
    expect(def).toContain('cannot be submitted without backup documentation');
    expect(def).toContain('INSERT INTO public.notifications');
    expect(def).toContain("'management'::app_role");
  });
});

describe('the five writers are reachable from a screen', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const lib = read('src/lib/accessorialAdjustments.ts');

  it('every writer has a client call site', () => {
    for (const fn of [
      'create_accessorial_adjustment',
      'submit_accessorial_adjustment',
      'approve_accessorial_adjustment',
      'reject_accessorial_adjustment',
      'void_accessorial_adjustment',
    ]) {
      expect(lib).toContain(fn);
    }
  });

  it('the load page renders the card and both portals render the review page', () => {
    expect(read('src/pages/dispatch/LoadDetailPage.tsx')).toContain('<LateAccessorialsCard');
    expect(read('src/pages/management/ManagementPortal.tsx')).toContain('<LateAccessorialsPage />');
    expect(read('src/pages/dispatch/DispatchPortal.tsx')).toContain('<LateAccessorialsPage />');
  });

  it('both portals carry a navigation item that points at it', () => {
    expect(read('src/pages/management/ManagementPortal.tsx')).toContain("path: 'late-accessorials'");
    expect(read('src/pages/dispatch/DispatchPortal.tsx')).toContain("path: 'dispatch-late-accessorials'");
  });

  it('the client mirror of the proof mapping says it is not authoritative', () => {
    expect(lib).toContain('MIRROR of public.accessorial_proof_kind(text)');
    expect(lib).toContain('NOT STATED BY THE OWNER');
  });
});

/**
 * Module 5 Pass 6 — what the ROW says. Six findings came from looking at a
 * rendered screen; these hold the display honest.
 */
describe('what an adjustment row tells the reader', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const card = read('src/components/dispatch/loadDetail/LateAccessorialsCard.tsx');

  const base = {
    id: 'a', load_id: 'l', reference: 'ST-TEST-005-A1', sequence: 1,
    charge_type: 'detention', description: null, amount: 275, funding_source: null,
    actual_cost: null, proof_document_id: null, proof_kind: null,
    status: 'draft', reason: null, billing_state: 'not_required',
    approved_at: null, approved_by: null, settlement_id: null, invoice_id: null,
    created_at: '2026-09-04T00:00:00Z', created_by: null, updated_at: null,
  } as const;

  it('an approved row without proof is grandfathered, never told what it needs', () => {
    expect(proofState({ ...base, status: 'approved', proof_document_id: null })).toBe('grandfathered');
    expect(card).toContain('Approved before backup documentation was required');
  });

  it('a draft without proof is told what it needs, and cannot be sent', () => {
    expect(proofState({ ...base, status: 'draft', proof_document_id: null })).toBe('required');
    expect(submitBlockedReason({ ...base } as never)).toContain('Attach');
  });

  it('a draft with proof can be sent', () => {
    expect(proofState({ ...base, proof_document_id: 'd' })).toBe('attached');
    expect(submitBlockedReason({ ...base, proof_document_id: 'd' } as never)).toBeNull();
  });

  it('the blocked action is disabled on the row rather than offered and refused', () => {
    expect(card).toContain('disabled={!!blocked}');
    expect(card).toContain('adjustment-blocked-');
  });

  it('the row names who recorded it and who approved it', () => {
    expect(card).toContain('by ${row.created_by_name}');
    expect(card).toContain('by ${row.approved_by_name}');
  });

  it('the row says where the money is, in both directions', () => {
    expect(card).toContain('Not on a settlement yet');
    expect(card).toContain('Due to the driver on the settlement');
    expect(card).toContain('BILLING_STATE_LABELS[row.billing_state]');
  });

  it('the document can be attached from inside both dialogs, through the load path', () => {
    const picker = read('src/components/accessorials/ProofPicker.tsx');
    expect(picker).toContain('uploadLoadDocument');
    expect(read('src/components/accessorials/RecordAdjustmentDialog.tsx')).toContain('<ProofPicker');
    expect(read('src/components/accessorials/AdjustmentActionDialog.tsx')).toContain('<ProofPicker');
    expect(read('src/lib/accessorialAdjustments.ts')).toContain('attach_accessorial_adjustment_proof');
  });

  it('no placeholder in these dialogs is long enough to be cut mid-word', () => {
    const files = [
      'src/components/accessorials/RecordAdjustmentDialog.tsx',
      'src/components/accessorials/AdjustmentActionDialog.tsx',
      'src/components/accessorials/ProofPicker.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/placeholder="([^"]+)"/g)) {
        // Single-line inputs cannot scroll a placeholder; keep them short.
        expect(m[1].length, `${f}: ${m[1]}`).toBeLessThanOrEqual(34);
      }
    }
  });
});
