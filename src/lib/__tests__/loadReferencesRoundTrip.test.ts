import { beforeEach, describe, expect, it, vi } from 'vitest';

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
 * write and the read against a fake PostgREST that stores what it is given, so
 * the assertion is "what went in comes back out", including the per-stop printed
 * label that the first version of the write silently replaced with the row label.
 */

interface Row { [k: string]: unknown }

const tables: Record<string, Row[]> = {
  load_stops: [],
  load_references: [],
  load_reference_citations: [],
};

/** Minimal stand-in for the query builder shapes loadReferences.ts uses. */
function makeClient() {
  return {
    from(table: string) {
      const rows = tables[table];
      const api = {
        _filters: [] as ((r: Row) => boolean)[],
        _selected: null as Row[] | null,
        select(_cols: string) {
          const base = this._selected ?? rows.filter(r => this._filters.every(f => f(r)));
          const embed = (list: Row[]) => list.map(r => ({
            ...r,
            load_reference_citations: tables.load_reference_citations
              .filter(c => c.reference_id === r.id)
              .map(c => ({ stop_sequence: c.stop_sequence, printed_label: c.printed_label })),
          }));
          const resolved = (list: Row[]) => {
            const result = { data: embed(list), error: null };
            return Object.assign(Promise.resolve(result), {
              eq: (col: string, val: unknown) => resolved(list.filter(r => r[col] === val)),
              order: () => resolved(list),
            });
          };
          return resolved(base);
        },

        eq(col: string, val: unknown) {
          this._filters.push(r => r[col] === val);
          return this;
        },
        in(col: string, vals: unknown[]) {
          this._filters.push(r => vals.includes(r[col]));
          return this;
        },
        upsert(payload: Row[], opts: { onConflict: string }) {
          const keys = opts.onConflict.split(',');
          payload.forEach(p => {
            const at = rows.findIndex(r => keys.every(k => r[k] === p[k]));
            if (at >= 0) rows[at] = { ...rows[at], ...p };
            else rows.push({ id: `ref-${rows.length + 1}`, ...p });
          });
          this._selected = payload.map(p =>
            rows.find(r => keys.every(k => r[k] === p[k])) as Row);
          return this;
        },
        insert(payload: Row[]) {
          payload.forEach(p => rows.push({ id: `row-${rows.length + 1}`, ...p }));
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          const self = api;
          return {
            in(col: string, vals: unknown[]) {
              for (let i = rows.length - 1; i >= 0; i -= 1) {
                if (vals.includes(rows[i][col])) rows.splice(i, 1);
              }
              void self;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        order() { return this.select('*'); },
      };
      return api;
    },
  };
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: makeClient() }));

const LOAD_ID = 'load-1';

beforeEach(() => {
  tables.load_references.length = 0;
  tables.load_reference_citations.length = 0;
  tables.load_stops.length = 0;
  tables.load_stops.push(
    { id: 'stop-a', load_id: LOAD_ID, stop_sequence: 1 },
    { id: 'stop-b', load_id: LOAD_ID, stop_sequence: 2 },
  );
});

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
    ]);

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
    }]);
    expect(tables.load_reference_citations[0].load_stop_id).toBe('stop-b');
  });

  it('treats an empty array as a no-op, not a wipe', async () => {
    const { saveLoadReferences, fetchLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [{
      reference_class: 'bol', label: 'BOL', value: '562117', citations: [],
    }]);
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
    await saveLoadReferences(LOAD_ID, [row]);
    await saveLoadReferences(LOAD_ID, [{
      ...row, citations: [{ stopSequence: 2, printedLabel: 'Pickup Number' }],
    }]);
    const back = await fetchLoadReferences(LOAD_ID);
    expect(back).toHaveLength(1);
    expect(back[0].citations).toEqual([{ stopSequence: 2, printedLabel: 'Pickup Number' }]);
  });
});
