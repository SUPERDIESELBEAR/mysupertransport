import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * NO SECOND ANSWER TO "WHAT IS THIS DRIVER'S UNIT NUMBER".
 *
 * The Ali Mohamed defect was not a wrong value anywhere — it was two readers
 * each correctly reading a DIFFERENT column, with nothing able to notice. A
 * unit test cannot catch that, because each reader passes its own test. Only a
 * structural guard can: every fuel consumer goes through `resolveOperatorUnit`,
 * and a new one that quietly reads `operators.unit_number` alone fails here.
 */

const read = (p: string) => readFileSync(p, 'utf8');

/** Fuel surfaces that display or export a driver's unit. */
const CONSUMERS = [
  'src/lib/fuel/fuelOperators.ts',
  'src/pages/management/FuelImportPage.tsx',
];

describe('unit number resolution is centralised', () => {
  it('the rule lives in operatorUnit.ts and mirrors the SQL helper', () => {
    const src = read('src/lib/fuel/operatorUnit.ts');
    expect(src).toContain('export function resolveOperatorUnit');
    expect(src).toContain('operator_unit_number');
  });

  it('fuel consumers resolve through the shared module, never a raw column', () => {
    for (const path of CONSUMERS) {
      const src = read(path);
      expect(src, `${path} must import the shared resolver`)
        .toMatch(/from '@\/lib\/fuel\/operatorUnit'|from '\.\/operatorUnit'/);
    }
  });

  it('the operator picker does not fall back to operators.unit_number alone', () => {
    const src = read('src/lib/fuel/fuelOperators.ts');
    // The old shape mapped `unit: o.unit_number` straight out of the operators row.
    expect(src).not.toMatch(/unit:\s*o\.unit_number/);
    expect(src).toContain('resolveOperatorUnit');
  });

  it('the driver PDF receives a resolved unit, it does not resolve one', () => {
    const src = read('src/lib/fuel/fuelDriverPdf.ts');
    expect(src).not.toContain('unit_number');
  });
});
