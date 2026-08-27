import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake } from '@/test/helpers/pgFake';
import { classifyReferenceLabel } from '@/lib/referenceClasses';
import { backfillHistoryRow, planReferenceBackfill, type BackfillRow } from '@/lib/referenceBackfill';

/**
 * REPORTED BUG — duplicate reference numbers after a revised rate confirmation.
 *
 * A reference whose printed label the map does not know classifies as
 * `unclassified` today and was stored as `other` before that class existed. The
 * revision diff keys on class + value, so the stored row did not match the
 * incoming one: one pre-accepted ADD and one unaccepted REMOVE for the same
 * number, and an INSERT rather than an update, leaving two rows on the card.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __reclassFake: { client: unknown } };
holder.__reclassFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__reclassFake.client; },
}));

const LOAD_ID = 'load-1';
beforeEach(() => fake.reset());

describe('classification — `other` and `unclassified` stay different things', () => {
  it('classifies a label the map has never been taught as unclassified', () => {
    expect(classifyReferenceLabel('Cargo Ref')).toBe('unclassified');
  });

  it('classifies an ABSENT label as other, not unclassified', () => {
    expect(classifyReferenceLabel(null)).toBe('other');
    expect(classifyReferenceLabel('')).toBe('other');
    expect(classifyReferenceLabel('  ')).toBe('other');
  });

  it('keeps the prefix fallback: `PU# (Shipper)` is a pickup number', () => {
    expect(classifyReferenceLabel('PU# (Shipper)')).toBe('pickup');
  });
});

/* ------------------------------------------------------------------ */

const stopsOf = () => [{ sequence: 1, stop_type: 'pickup', city: 'Joliet', state: 'IL' }];

async function diffFor(
  currentRefs: { reference_class: string; label: string; value: string; citations?: unknown[] }[],
  docRefs: { label: string | null; value: string }[],
) {
  const { buildRevisionDiff } = await import('@/lib/revisedRateCon');
  const current = {
    load_number: 'ST26035', stops: stopsOf(), references: currentRefs, charges: [],
  } as never;
  const parsed = { references: docRefs, stops: [] } as never;
  return buildRevisionDiff({ current, parsed, resolutions: {} } as never);
}

describe('revision diff — a reclassification is ONE entry', () => {
  it('reports a stored `other` row and an incoming `unclassified` row as one reclassification', async () => {
    const diff = await diffFor(
      [{ reference_class: 'other', label: 'Cargo Ref', value: 'CR-991', citations: [] }],
      [{ label: 'Cargo Ref', value: 'CR-991' }],
    );
    const refRows = diff.nonFinancial.filter(d => d.reference);
    expect(refRows).toHaveLength(1);
    expect(refRows[0].reference?.op).toBe('reclassified');
    expect(refRows[0].reference?.from_reference_class).toBe('other');
    expect(refRows[0].reference?.reference_class).toBe('unclassified');
    expect(refRows.some(d => d.reference?.op === 'removed')).toBe(false);
  });

  it('still reports a genuine addition as an addition', async () => {
    const diff = await diffFor(
      [{ reference_class: 'bol', label: 'BOL', value: '562117', citations: [] }],
      [{ label: 'BOL', value: '562117' }, { label: 'PRO', value: 'BG969676425' }],
    );
    const ops = diff.nonFinancial.filter(d => d.reference).map(d => d.reference?.op);
    expect(ops).toEqual(['added']);
  });

  it('still reports a genuine removal as a removal', async () => {
    const diff = await diffFor(
      [
        { reference_class: 'bol', label: 'BOL', value: '562117', citations: [] },
        { reference_class: 'pro', label: 'PRO', value: 'BG969676425', citations: [] },
      ],
      [{ label: 'BOL', value: '562117' }],
    );
    const refRows = diff.nonFinancial.filter(d => d.reference);
    expect(refRows.map(d => d.reference?.op)).toEqual(['removed']);
    expect(refRows[0].defaultAccept).toBe(false);
  });

  it('leaves a value that legitimately exists under two classes untouched', async () => {
    const diff = await diffFor(
      [
        { reference_class: 'bol', label: 'BOL', value: 'BG969676425', citations: [] },
        { reference_class: 'pro', label: 'PRO', value: 'BG969676425', citations: [] },
      ],
      [{ label: 'BOL', value: 'BG969676425' }, { label: 'PRO', value: 'BG969676425' }],
    );
    expect(diff.nonFinancial.filter(d => d.reference)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('save — applying a reclassification updates in place', () => {
  const seed = async () => {
    const { saveLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [{
      reference_class: 'other', label: 'Cargo Ref', value: 'CR-991',
      citations: [{ stopSequence: 1, printedLabel: 'Cargo Ref' }],
    }] as never);
  };

  const applyReclass = async () => {
    const { saveLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [{
      reference_class: 'unclassified', label: 'Cargo Ref', value: 'CR-991',
      citations: [{ stopSequence: 1, printedLabel: 'Cargo Ref' }],
    }] as never, {
      reclassifications: [{
        from_reference_class: 'other', to_reference_class: 'unclassified', value_key: 'CR991',
      }],
    });
  };

  it('leaves exactly one row, with its citations and created_at preserved', async () => {
    const { fetchLoadReferences } = await import('@/lib/loadReferences');
    await seed();
    const before = await fetchLoadReferences(LOAD_ID);
    expect(before).toHaveLength(1);

    await applyReclass();
    const after = await fetchLoadReferences(LOAD_ID);
    expect(after).toHaveLength(1);
    expect(after[0].reference_class).toBe('unclassified');
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].citations).toEqual([{ stopSequence: 1, printedLabel: 'Cargo Ref' }]);
  });

  it('is idempotent — re-running the same revision writes no second row', async () => {
    const { fetchLoadReferences } = await import('@/lib/loadReferences');
    await seed();
    await applyReclass();
    await applyReclass();
    expect(await fetchLoadReferences(LOAD_ID)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

const row = (over: Partial<BackfillRow>): BackfillRow => ({
  id: 'r1', load_id: LOAD_ID, reference_class: 'other', label: 'Cargo Ref',
  value: 'CR-991', value_key: 'CR991', created_at: '2026-01-01T00:00:00Z',
  citation_count: 0, ...over,
});

describe('backfill plan', () => {
  it('THE TRAP: a row with label = its class name is the no-label sentinel and is NOT reclassified', () => {
    const plan = planReferenceBackfill([row({ label: 'other' })]);
    expect(plan.reclassify).toHaveLength(0);
    expect(plan.sentinelsLeftAlone).toBe(1);
  });

  it('reclassifies a row carrying a real unrecognised printed label', () => {
    const plan = planReferenceBackfill([row({})]);
    expect(plan.reclassify).toEqual([expect.objectContaining({
      id: 'r1', from_reference_class: 'other', to_reference_class: 'unclassified',
    })]);
  });

  it('leaves a recognised label alone, prefix fallback included', () => {
    const plan = planReferenceBackfill([
      row({ id: 'a', label: 'BOL' }),
      row({ id: 'b', label: 'PU# (Shipper)' }),
    ]);
    expect(plan.reclassify).toHaveLength(0);
  });

  it('collapses a duplicate pair to one row and records the deletion', () => {
    const plan = planReferenceBackfill([
      row({ id: 'old', citation_count: 2, created_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'new', reference_class: 'unclassified', citation_count: 0, created_at: '2026-02-01T00:00:00Z' }),
    ]);
    expect(plan.reclassify.map(a => a.id)).toEqual(['old']);
    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].id).toBe('new');
    expect(plan.remove[0].kept_id).toBe('old');

    const history = backfillHistoryRow(plan.remove[0]);
    expect(history.load_id).toBe(LOAD_ID);
    expect(history.change_source).toBe('migration');
    expect(history.reason).toMatch(/reference_unclassified/);
  });
});
