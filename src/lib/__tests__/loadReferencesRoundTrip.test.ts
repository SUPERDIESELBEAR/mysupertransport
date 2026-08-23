import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * REFERENCE WRITE-PATH ROUND TRIP.
 *
 * This file exists because of a specific failure: `saveLoadReferences` was
 * written, tested at the classification layer, and never called. `load_references`
 * was empty for every load in the system, `loadToFormValues` hydrated
 * `references: []`, and a revised rate confirmation therefore reported all five
 * numbers it printed as additions — four of them phantoms.
 *
 * A test that only checks classification cannot see that. This one drives the
 * write and the read against a Postgres-shaped fake that stores what it is
 * given, so the assertion is "what went in comes back out", including the
 * per-stop printed label that the first version of the write silently replaced
 * with the row label.
 *
 * The fake now also enforces the `profiles(id)` foreign keys and takes the
 * `file_load_references` behaviour from the checked-in SQL, so the write is
 * exercised the way the database will run it.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __refFake: { client: unknown } };
holder.__refFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__refFake.client; },
}));

const LOAD_ID = 'load-1';

beforeEach(() => fake.reset());

describe('load reference write path', () => {
  it('writes rows that read back with the same values and citations', async () => {
    const { saveLoadReferences, fetchLoadReferences } = await import('@/lib/loadReferences');

    await saveLoadReferences(LOAD_ID, [
      {
        reference_class: 'pickup_number',
        label: 'Pickup Number',
        value: 'IX00286060',
        citations: [
          { stopSequence: 1, printedLabel: 'PU#' },
          { stopSequence: 2, printedLabel: 'Pickup Number' },
        ],
      },
      { reference_class: 'bol', label: 'BOL', value: '562117', citations: [] },
    ] as never);

    const back = await fetchLoadReferences(LOAD_ID);
    expect(back).toHaveLength(2);

    const pickup = back.find(r => r.reference_class === 'pickup_number');
    expect(pickup?.value).toBe('IX00286060');
    // The stop's own wording survives the write. Substituting the row label
    // here is what erased `PU#` in the first implementation.
    expect(pickup?.citations).toEqual([
      { stopSequence: 1, printedLabel: 'PU#' },
      { stopSequence: 2, printedLabel: 'Pickup Number' },
    ]);
  });

  it('resolves each citation to the stop row with that sequence', async () => {
    const { saveLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [{
      reference_class: 'pickup_number', label: 'Pickup Number', value: 'A1',
      citations: [{ stopSequence: 2, printedLabel: 'PU#' }],
    }] as never);
    expect(fake.tables.load_reference_citations[0].load_stop_id).toBe('stop-b');
  });

  it('treats an empty array as a no-op, not a wipe', async () => {
    const { saveLoadReferences, fetchLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [{
      reference_class: 'bol', label: 'BOL', value: '562117', citations: [],
    }] as never);
    // A plain load-form save carries no references; it must not delete what the
    // rate confirmation established.
    await saveLoadReferences(LOAD_ID, []);
    expect(await fetchLoadReferences(LOAD_ID)).toHaveLength(1);
  });

  it('re-saving the same reference updates in place rather than duplicating', async () => {
    const { saveLoadReferences, fetchLoadReferences } = await import('@/lib/loadReferences');
    const row = {
      reference_class: 'pickup_number', label: 'Pickup Number', value: 'IX00286060',
      citations: [{ stopSequence: 1, printedLabel: 'PU#' }],
    };
    await saveLoadReferences(LOAD_ID, [row] as never);
    await saveLoadReferences(LOAD_ID, [{
      ...row, citations: [{ stopSequence: 2, printedLabel: 'Pickup Number' }],
    }] as never);
    const back = await fetchLoadReferences(LOAD_ID);
    expect(back).toHaveLength(1);
    expect(back[0].citations).toEqual([{ stopSequence: 2, printedLabel: 'Pickup Number' }]);
  });
});
