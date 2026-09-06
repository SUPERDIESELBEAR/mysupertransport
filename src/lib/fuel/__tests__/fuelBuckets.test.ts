import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import {
  FUEL_LINE_TYPE_BUCKET,
  bucketOf,
  fuelBucketLines,
  FUEL_DISCREPANCY_LABELS,
  FUEL_IMPORT_FLAG_SUFFIX,
} from '../fuelBuckets';
import { computeSettlement } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';

/**
 * MODULE 6 — the fuel deduction, broken out.
 *
 * The assertions that matter here are the two invariants: every enum value has
 * a bucket, and the buckets sum to the deduction in every arrangement of line
 * rows anyone can contrive. A labelling change that moves a driver's money is
 * not a labelling change.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('fuelBuckets ENUM COVERAGE DID NOT RUN AGAINST THE LIVE ENUM', [
    'No PGHOST, so pg_enum could not be read. The TypeScript Record proves',
    'only that the values THIS FILE knows about are decided; a value added',
    'to fuel_line_type in the database alone would go unnoticed.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live fuel_line_type enum could not be read',
  details: ['Only this check sees an enum value added out of band.'],
});

function liveEnumValues(): string[] {
  return execFileSync('psql', ['-At', '-c',
    "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid "
    + "where t.typname = 'fuel_line_type' order by e.enumsortorder"],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

describe('every fuel line type has a bucket', () => {
  it('assigns the discount to the sentinel, never to a charge bucket', () => {
    expect(FUEL_LINE_TYPE_BUCKET.fuel_discount).toBe('discount');
  });

  it('keeps advance fees with the advance, and repairs out of fuel', () => {
    expect(FUEL_LINE_TYPE_BUCKET.fees).toBe('cash_advance');
    expect(FUEL_LINE_TYPE_BUCKET.minor_repairs).toBe('repair');
    expect(FUEL_LINE_TYPE_BUCKET.tires).toBe('repair');
    expect(FUEL_LINE_TYPE_BUCKET.def).toBe('fuel');
  });

  itLive('the live enum has no value this map has not decided', () => {
    const missing = liveEnumValues().filter(v => !(v in FUEL_LINE_TYPE_BUCKET));
    expect(missing).toEqual([]);
  });

  itLive('the map invents no value the live enum does not have', () => {
    const live = new Set(liveEnumValues());
    expect(Object.keys(FUEL_LINE_TYPE_BUCKET).filter(k => !live.has(k))).toEqual([]);
  });

  it('files an unknown line type under other rather than dropping it', () => {
    expect(bucketOf('something_new')).toBe('other');
  });
});

const stamp = { invoiceDate: '2026-08-28', invoiceNo: '771030' };

describe('the buckets always sum to the deduction', () => {
  const sum = (ls: { amount: number }[]) =>
    Math.round(ls.reduce((t, l) => t + l.amount, 0) * 100) / 100;

  it('splits a mixed invoice into fuel, advance and repair', () => {
    const lines = fuelBucketLines({
      grossAmount: 700,
      ...stamp,
      lines: [
        { line_type: 'diesel', amount: 500 },
        { line_type: 'cash_advance_emoney', amount: 100 },
        { line_type: 'fees', amount: 15 },
        { line_type: 'minor_repairs', amount: 85 },
      ],
    });
    expect(lines.map(l => [l.bucket, l.amount])).toEqual([
      ['fuel', 500], ['cash_advance', 115], ['repair', 85],
    ]);
    expect(sum(lines)).toBe(700);
    expect(lines[0].description).toBe('Fuel — 08/28/2026 (invoice 771030)');
  });

  it('never lets the discount reduce a bucket', () => {
    const lines = fuelBucketLines({
      grossAmount: 520,
      ...stamp,
      lines: [
        { line_type: 'diesel', amount: 500 },
        { line_type: 'fuel_discount', amount: -20 },
        { line_type: 'misc', amount: 20 },
      ],
    });
    expect(sum(lines)).toBe(520);
    expect(lines.find(l => l.bucket === 'fuel')!.amount).toBe(500);
    expect(lines.find(l => l.bucket === 'other')!.amount).toBe(20);
  });

  it('rides as one fuel line when nothing was itemised', () => {
    const lines = fuelBucketLines({ grossAmount: 431.22, lines: [], ...stamp });
    expect(lines).toHaveLength(1);
    expect(lines[0].bucket).toBe('fuel');
    expect(lines[0].amount).toBe(431.22);
  });

  it('names a short itemisation as unexplained instead of filing it under other', () => {
    const lines = fuelBucketLines({
      grossAmount: 600, ...stamp,
      lines: [{ line_type: 'diesel', amount: 400 }],
    });
    expect(sum(lines)).toBe(600);
    expect(lines.find(l => l.bucket === 'other')).toBeUndefined();
    const gap = lines.find(l => l.isDiscrepancy)!;
    expect(gap.bucket).toBe('discrepancy');
    expect(gap.amount).toBe(200);
    expect(gap.description).toBe(
      `${FUEL_DISCREPANCY_LABELS.short} — 08/28/2026 (invoice 771030)`,
    );
  });

  it('names an over-itemised transaction with the right sign, never as a credit', () => {
    const lines = fuelBucketLines({
      grossAmount: 400, ...stamp,
      lines: [{ line_type: 'diesel', amount: 500 }],
    });
    expect(sum(lines)).toBe(400);
    expect(lines.find(l => l.bucket === 'other')).toBeUndefined();
    const gap = lines.find(l => l.isDiscrepancy)!;
    expect(gap.amount).toBe(-100);
    expect(gap.description.startsWith(FUEL_DISCREPANCY_LABELS.over)).toBe(true);
    expect(gap.description.toLowerCase()).toContain('not a credit');
  });

  it('raises no discrepancy when nothing was itemised — there is nothing to reconcile', () => {
    const lines = fuelBucketLines({ grossAmount: 431.22, lines: [], ...stamp });
    expect(lines.some(l => l.isDiscrepancy)).toBe(false);
    expect(lines[0].bucket).toBe('fuel');
  });

  it('raises no discrepancy when four buckets add up exactly', () => {
    const lines = fuelBucketLines({
      grossAmount: 700, ...stamp,
      lines: [
        { line_type: 'diesel', amount: 400 },
        { line_type: 'cash_advance_emoney', amount: 150 },
        { line_type: 'tires', amount: 100 },
        { line_type: 'oil', amount: 50 },
      ],
    });
    expect(lines.map(l => l.bucket)).toEqual(['fuel', 'cash_advance', 'repair', 'other']);
    expect(lines.some(l => l.isDiscrepancy)).toBe(false);
    expect(sum(lines)).toBe(700);
  });

  it('surfaces the importer flag on every line even when the rows do sum', () => {
    const lines = fuelBucketLines({
      grossAmount: 500, ...stamp,
      reconciliationOk: false, reconciliationDelta: -12.5,
      lines: [{ line_type: 'diesel', amount: 500 }],
    });
    expect(lines.every(l => l.description.endsWith(FUEL_IMPORT_FLAG_SUFFIX))).toBe(true);
    expect(sum(lines)).toBe(500);
  });

  it('keeps buckets plus discrepancy equal to the gross for arbitrary rows', () => {
    for (const [gross, amounts] of [
      [1000, [10.01, 20.02, 30.03]],
      [0.05, [0.03]],
      [250, [100, 100, 100]],
      [99.99, [33.33, 33.33, 33.33]],
    ] as [number, number[]][]) {
      const lines = fuelBucketLines({
        grossAmount: gross, ...stamp,
        lines: amounts.map((a, i) => ({ line_type: ['diesel', 'fees', 'oil'][i % 3], amount: a })),
      });
      expect(sum(lines)).toBe(gross);
    }
  });
});

describe('the settlement it produces charges the same money', () => {
  const base = {
    operatorId: 'op-1',
    periodAnchorDate: '2026-08-20',
    settings: SETTLEMENT_SETTINGS_DEFAULTS,
    companyPolicy: null,
    loads: [],
    equipmentOutstanding: false,
  };
  const gross = 700;
  const lines = [
    { line_type: 'diesel', amount: 500 },
    { line_type: 'cash_advance_emoney', amount: 100 },
    { line_type: 'minor_repairs', amount: 100 },
  ];

  it('deducts the identical total whether or not the buckets are supplied', () => {
    const plain = computeSettlement({
      ...base, fuel: [{ id: 'f1', grossAmount: gross }],
    });
    const split = computeSettlement({
      ...base,
      fuel: [{ id: 'f1', grossAmount: gross, buckets: fuelBucketLines({ grossAmount: gross, lines, ...stamp }) }],
    });
    expect(split.netAmount).toBe(plain.netAmount);
    expect(split.lines.filter(l => l.lineType === 'fuel')).toHaveLength(3);
    expect(plain.lines.filter(l => l.lineType === 'fuel')).toHaveLength(1);
  });

  it('names the repair on its own line, so it can be seen and questioned', () => {
    const s = computeSettlement({
      ...base,
      fuel: [{ id: 'f1', grossAmount: gross, buckets: fuelBucketLines({ grossAmount: gross, lines, ...stamp }) }],
    });
    const repair = s.lines.find(l => l.description.startsWith('Repairs'))!;
    expect(repair.amount).toBe(-100);
    expect(repair.sourceTable).toBe('fuel_transactions');
    expect(repair.sourceId).toBe('f1');
  });
});
