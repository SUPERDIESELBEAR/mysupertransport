/**
 * THE BASELINE RULE IS THE WHOLE REPORT.
 *
 * The failure this suite exists to prevent is not a wrong number — it is a
 * report that flags all 69 rows of a first import and teaches the owner to
 * ignore it. So the first-import case is asserted as hard as the flagging case,
 * and the card-change case (Ali Mohamed, 212 → 224) is asserted because per-card
 * baselining is the reason the report is per card at all.
 */
import { describe, expect, it } from 'vitest';
import {
  buildFuelExceptionsReport, categoriesOf,
  type FuelExceptionBatch, type FuelExceptionTransaction,
} from '../fuelExceptions';

const batch = (id: string, imported: string): FuelExceptionBatch => ({
  id,
  file_name: `${id}.csv`,
  imported_at: imported,
  date_range_start: '2026-08-28',
  date_range_end: '2026-09-01',
});

let seq = 0;
const txn = (
  over: Partial<FuelExceptionTransaction> & { batch_id: string },
): FuelExceptionTransaction => ({
  id: `t${++seq}`,
  card_no: '212',
  operator_id: 'op-1',
  driver_name: 'Ali Mohamed',
  unit_no: null,
  invoice_no: '771030',
  invoice_date: '2026-08-28',
  total_amount: 400,
  fuel_discount_amount: 0,
  reconciliation_ok: true,
  match_status: 'matched',
  fuel_transaction_lines: [{ line_type: 'diesel', amount: 400 }],
  ...over,
});

const units = new Map<string, string | null>([['op-1', '260']]);

describe('the first import is a baseline, not 69 exceptions', () => {
  it('flags nothing and says why when every card has one import', () => {
    const report = buildFuelExceptionsReport({
      batches: [batch('b1', '2026-09-09T16:37:28Z')],
      transactions: [
        txn({ batch_id: 'b1' }),
        txn({ batch_id: 'b1', fuel_transaction_lines: [{ line_type: 'oil', amount: 42.1 }] }),
      ],
      unitByOperator: units,
    });
    expect(report.newCategories).toEqual([]);
    expect(report.insufficientHistory).toBe(true);
    expect(report.cardsOnBaseline).toBe(1);
    expect(report.cardsWithHistory).toBe(0);
    expect(report.historyNote).toContain('every card is still on its baseline');
  });

  it('says something different when there is no fuel at all', () => {
    const report = buildFuelExceptionsReport({ batches: [], transactions: [] });
    expect(report.historyNote).toContain('No fuel has been imported yet');
    expect(report.imports).toBe(0);
  });
});

describe('a category new to the card on a second import', () => {
  const report = () => buildFuelExceptionsReport({
    batches: [batch('b1', '2026-09-09T16:37:28Z'), batch('b2', '2026-09-16T16:00:00Z')],
    transactions: [
      txn({ batch_id: 'b1' }),
      txn({ batch_id: 'b2' }),
      txn({
        batch_id: 'b2', invoice_date: '2026-09-04',
        fuel_transaction_lines: [{ line_type: 'oil', amount: 42.1 }],
      }),
    ],
    unitByOperator: units,
  });

  it('is flagged once, named, and priced', () => {
    const out = report();
    expect(out.insufficientHistory).toBe(false);
    expect(out.newCategories).toHaveLength(1);
    const [x] = out.newCategories;
    expect(x.categoryKey).toBe('oil');
    expect(x.categoryLabel).toBe('Oil');
    expect(x.amount).toBe(42.1);
    expect(x.driver).toBe('Unit 260 · Ali Mohamed');
    expect(x.message).toBe(
      'Unit 260 · Ali Mohamed — first Oil charge on card 212 (Other fuel-card charges), '
      + '$42.10 on 09/04/2026. No earlier import for this card carries it.',
    );
  });

  it('does not flag the category the baseline already carried', () => {
    expect(report().newCategories.map((x) => x.categoryKey)).not.toContain('diesel');
  });

  it('reports two charges of the same new category as one thing to glance at', () => {
    const out = buildFuelExceptionsReport({
      batches: [batch('b1', '2026-09-09T16:37:28Z'), batch('b2', '2026-09-16T16:00:00Z')],
      transactions: [
        txn({ batch_id: 'b1' }),
        txn({ batch_id: 'b2', fuel_transaction_lines: [{ line_type: 'oil', amount: 42.1 }] }),
        txn({ batch_id: 'b2', fuel_transaction_lines: [{ line_type: 'oil', amount: 11 }] }),
      ],
      unitByOperator: units,
    });
    expect(out.newCategories).toHaveLength(1);
    expect(out.newCategories[0].occurrences).toBe(2);
  });

  it('does not re-flag on a third import once the card has carried it', () => {
    const out = buildFuelExceptionsReport({
      batches: [
        batch('b1', '2026-09-09T16:37:28Z'),
        batch('b2', '2026-09-16T16:00:00Z'),
        batch('b3', '2026-09-23T16:00:00Z'),
      ],
      transactions: [
        txn({ batch_id: 'b1' }),
        txn({ batch_id: 'b2', fuel_transaction_lines: [{ line_type: 'oil', amount: 42.1 }] }),
        txn({ batch_id: 'b3', fuel_transaction_lines: [{ line_type: 'oil', amount: 39 }] }),
      ],
      unitByOperator: units,
    });
    expect(out.newCategories).toHaveLength(1);
    expect(out.newCategories[0].transactionId).toBeTruthy();
  });
});

describe('a new card is a new baseline', () => {
  it('Ali Mohamed 212 → 224: card 224 is baselined, not flagged for everything', () => {
    const out = buildFuelExceptionsReport({
      batches: [batch('b1', '2026-09-09T16:37:28Z'), batch('b2', '2026-09-16T16:00:00Z')],
      transactions: [
        txn({ batch_id: 'b1', card_no: '212' }),
        txn({ batch_id: 'b2', card_no: '224' }),
        txn({
          batch_id: 'b2', card_no: '224',
          fuel_transaction_lines: [{ line_type: 'oil', amount: 42.1 }],
        }),
      ],
      unitByOperator: units,
    });
    // Card 224's only import is its baseline, so nothing on it can be an
    // exception yet — including a category card 212 never carried.
    expect(out.newCategories).toEqual([]);
    expect(out.cardsOnBaseline).toBe(2);
    expect(out.insufficientHistory).toBe(true);
  });
});

describe('unmatched rows need no history', () => {
  it('are reported on the very first import, with what the statement said', () => {
    const out = buildFuelExceptionsReport({
      batches: [batch('b1', '2026-09-09T16:37:28Z')],
      transactions: [txn({
        batch_id: 'b1', match_status: 'unmatched', card_no: '224',
        driver_name: 'A MOHAMED', unit_no: '260', total_amount: 312.44,
      })],
      unitByOperator: units,
    });
    expect(out.unmatched).toHaveLength(1);
    expect(out.unmatched[0].message).toBe(
      'Card 224 — $312.44 on 08/28/2026 did not match a driver. '
      + 'The statement says A MOHAMED, unit 260.',
    );
    // An unmatched row has no driver, so it cannot contribute to any card history.
    expect(out.cardsOnBaseline).toBe(0);
  });

  it('counts matched rows with no card rather than flagging them', () => {
    const out = buildFuelExceptionsReport({
      batches: [batch('b1', '2026-09-09T16:37:28Z')],
      transactions: [txn({ batch_id: 'b1', card_no: null })],
    });
    expect(out.rowsWithoutCard).toBe(1);
    expect(out.newCategories).toEqual([]);
  });
});

describe('categories come from the shared bucket module', () => {
  it('ignores the discount, which is a price reduction and not a purchase', () => {
    const keys = categoriesOf(txn({
      batch_id: 'b1',
      fuel_transaction_lines: [
        { line_type: 'diesel', amount: 400 },
        { line_type: 'fuel_discount', amount: 25 },
      ],
    })).map((c) => c.key);
    expect(keys).toEqual(['diesel']);
  });

  it('falls back to the shared assembler when nothing was itemised', () => {
    const categories = categoriesOf(txn({
      batch_id: 'b1', fuel_transaction_lines: [], total_amount: 400, fuel_discount_amount: 25,
    }));
    expect(categories).toEqual([
      expect.objectContaining({ key: 'fuel', label: 'Fuel', amount: 375 }),
    ]);
  });
});
