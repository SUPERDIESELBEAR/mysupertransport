/**
 * THE BUCKET MAPPING IS DEFINED ONCE.
 *
 * A spy test proves a consumer CALLED `fuelBucketLines`. It does not prove a
 * private second map is not sitting beside the call — which is exactly how
 * three copies of a pay percentage came to exist, recorded in
 * `src/test/shared-pay-percentage-source-guard.test.ts`. This guard reads the
 * consuming modules as text and refuses a local `line_type` → bucket map.
 *
 * Comments are stripped before matching, so the reasoning in those files is
 * free to name the categories it is protecting.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** Every module that turns fuel line rows into driver-facing categories. */
const CONSUMERS = [
  'src/lib/fuel/fuelImportView.ts',
  'src/lib/fuel/fuelDriverDetail.ts',
  'src/lib/settlementRun.ts',
];

/**
 * Modules that show a driver his money but do NOT assemble buckets themselves:
 * they go through `fuelDriverDetail`, which goes through the owner. The rule
 * for these is the same in substance — no local `line_type` decision — but the
 * call they must make is `buildDriverRows`, not `fuelBucketLines`. The operator
 * surface is here because this is the file that would notice a second, quietly
 * different version of the driver's numbers being written for the portal.
 */
const DERIVED = [
  'src/lib/fuel/myFuel.ts',
  'src/components/operator/MyFuel/index.tsx',
  'src/pages/management/FuelDriverDetailPage.tsx',
];

/**
 * The two SCREENS. `myFuel.ts` is excluded on purpose: it only reshapes rows
 * the database returned and hands them on, so requiring the builder there
 * would be requiring the wrong thing in the wrong layer.
 */
const SCREENS = [
  'src/components/operator/MyFuel/index.tsx',
  'src/pages/management/FuelDriverDetailPage.tsx',
];

const OWNER = 'src/lib/fuel/fuelBuckets.ts';

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the fuel bucket mapping has exactly one definition', () => {
  it('names every line type in the owning module only', () => {
    const owner = code(OWNER);
    expect(owner).toContain('cash_advance_emoney');
    for (const path of CONSUMERS) {
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const src = code(path);
      // `fuel_discount` is deliberately NOT in this list: consumers legitimately
      // read the COLUMN `fuel_discount_amount`, which is the transaction's own
      // field and not a line-type decision.
      for (const lineType of [
        'cash_advance_emoney', 'cash_advance_12digit', 'cash_advance_insta',
        'minor_repairs', 'diesel1', 'reefer_cng',
      ]) {
        expect(src.includes(lineType), `${path} names the line type ${lineType}`).toBe(false);
      }
    }
  });

  it('requires each consumer to call the shared assembler', () => {
    for (const path of CONSUMERS) {
      expect(code(path).includes('fuelBucketLines('), `${path} does not call fuelBucketLines`)
        .toBe(true);
    }
  });

  it('refuses a second FUEL_LINE_TYPE_BUCKET style record outside the owner', () => {
    for (const path of CONSUMERS) {
      expect(/Record<\s*FuelLineType/.test(code(path)), `${path} declares its own map`).toBe(false);
    }
  });
});

describe('the driver-facing surfaces share one arithmetic', () => {
  it('keeps every line-type decision out of the derived surfaces', () => {
    for (const path of DERIVED) {
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const src = code(path);
      for (const lineType of [
        'cash_advance_emoney', 'cash_advance_12digit', 'cash_advance_insta',
        'minor_repairs', 'diesel1', 'reefer_cng',
      ]) {
        expect(src.includes(lineType), `${path} names the line type ${lineType}`).toBe(false);
      }
      expect(/Record<\s*FuelLineType/.test(src), `${path} declares its own map`).toBe(false);
    }
  });

  it('requires each derived surface to build its rows with the shared builder', () => {
    for (const path of SCREENS) {
      expect(code(path).includes('buildDriverRows'), `${path} does not call buildDriverRows`)
        .toBe(true);
    }
  });

  it('keeps staff diagnostics off the operator surface', () => {
    // Match status, unmatched reasons and reconciliation notes describe the
    // quality of OUR records. They are staff tools and must not appear here.
    const operator = code('src/components/operator/MyFuel/index.tsx')
      + code('src/lib/fuel/myFuel.ts');
    for (const staffOnly of [
      'match_status', 'disagreement', 'fuelDiagnosis', 'unmatched',
    ]) {
      expect(operator.includes(staffOnly), `the operator surface names ${staffOnly}`).toBe(false);
    }
  });
});
