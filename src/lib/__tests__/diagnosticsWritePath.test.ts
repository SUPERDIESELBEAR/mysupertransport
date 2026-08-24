import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake, PROFILE_ID } from '@/test/helpers/pgFake';

/**
 * The diagnostics write, at the boundary that kept failing.
 *
 * Four causes in a row on one path: a write with no reader, a policy that
 * compared against a different kind of id, a bulk insert with two row shapes,
 * and finally 42501 — the column default called `current_profile_id()`, which
 * evaluates in the CALLER's context and is deliberately not executable by
 * `authenticated`. The insert died before RLS or row shape mattered.
 *
 * So the assertions here are: the client goes through the definer RPC, it sends
 * no actor id, the row is stamped with the profile id anyway, and the returned
 * count is the number of rows that actually landed — never an assumed one.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __diagWriteFake: { client: unknown } };
holder.__diagWriteFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__diagWriteFake.client; },
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const misses = [
  {
    field: 'broker_terms_verbatim',
    failure: 'no_anchor',
    occurrences: 1,
    stopNumber: null,
    headings: ['TRAILER RELOCATION AGREEMENT'],
    ordering: null,
  },
];
vi.mock('@/lib/verbatimRegions', () => ({
  takeAnchorMisses: () => misses.splice(0, misses.length),
}));

beforeEach(() => { fake.reset(); });

describe('the diagnostics write goes through the definer RPC', () => {
  it('writes the collected rows and reports the count the server returned', async () => {
    const { logParserDiagnostics } = await import('@/lib/parserDiagnostics');
    const rpc = vi.spyOn(fake.client as { rpc: (...a: unknown[]) => unknown }, 'rpc');

    const result = await logParserDiagnostics(
      { unrecognized: [], dropped: [{ label: 'Assign at pickup', clazz: 'unclassified' }] },
      { loadId: 'load-1', loadNumber: 'TEST-1', documentLabel: 'rollingriver.pdf', parserContract: 4 },
    );

    expect(result.error).toBeNull();
    expect(result.collected).toBe(2);
    // The number the RPC returned, not the number we hoped for.
    expect(result.written).toBe(2);

    expect(rpc).toHaveBeenCalledWith('log_parser_diagnostics', expect.anything());
    const payload = (rpc.mock.calls[0][1] as { p_rows: Record<string, unknown>[] }).p_rows;
    // A client never sends an actor id.
    payload.forEach(r => {
      expect(r).not.toHaveProperty('created_by');
      expect(r).not.toHaveProperty('resolved_by');
    });

    const rows = fake.tables.parser_diagnostics;
    expect(rows).toHaveLength(2);
    // Stamped server-side with the profile id, not the auth uid.
    rows.forEach(r => expect(r.created_by).toBe(PROFILE_ID));
    expect(rows[0].failure).toBe('no_anchor');
    expect(rows[0].headings).toContain('TRAILER RELOCATION AGREEMENT');
    expect(rows[1].kind).toBe('reference_row_dropped');
  });

  it('never inserts into the table directly — the RPC is the only writer', async () => {
    const from = vi.spyOn(fake.client as { from: (t: string) => unknown }, 'from');
    const { logParserDiagnostics } = await import('@/lib/parserDiagnostics');
    misses.push({
      field: 'special_instructions_verbatim',
      failure: 'empty_region',
      occurrences: 1,
      stopNumber: null,
      headings: [],
      ordering: null,
    });
    await logParserDiagnostics(null, { loadNumber: 'TEST-1' });
    expect(from).not.toHaveBeenCalledWith('parser_diagnostics');
  });
});
