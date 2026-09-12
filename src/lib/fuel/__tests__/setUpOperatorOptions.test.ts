/**
 * THE FUEL SCREENS' DRIVER LIST OBEYS THE SHARED FILTER.
 *
 * Driver Fuel Detail listed applicants and unfinished onboarding records for a
 * day because it read the unfiltered active-operator list. The rule itself is
 * asserted in `passthroughDriverList.test.ts`; what is asserted here is that a
 * PAY-FACING fuel screen asks for the filtered list, and that the filtered list
 * is derived from the shared predicate rather than a second copy of the rule.
 *
 * SOURCE GUARD, NOT A CENSUS. It survives any driver being onboarded or
 * terminated; it fails only if a screen goes back to reading its own list.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the fuel driver list', () => {
  it('is derived from the shared five-condition predicate, not a second copy', () => {
    const src = read('src/lib/fuel/fuelOperators.ts');
    expect(src).toContain('fetchSetUpOperatorOptions');
    expect(src).toMatch(/isSetUpDriver/);
    expect(src).toMatch(/from '\.\/setupDriverFilter'/);
    // no re-implementation of the conditions in the fuel list helper
    expect(src).not.toMatch(/fully_onboarded/);
    expect(src).not.toMatch(/insurance_added_date/);
  });

  it('is what the pay-facing Driver Fuel Detail screen asks for', () => {
    const page = read('src/pages/management/FuelDriverDetailPage.tsx');
    expect(page).toContain('fetchSetUpOperatorOptions');
    expect(page).not.toMatch(/\bfetchOperatorOptions\b/);
  });

  it('leaves the import screen on the unfiltered list, deliberately', () => {
    // Fuel Import matches a whole card file, including rows belonging to drivers
    // who never finished onboarding. Narrowing it would hide those transactions.
    const page = read('src/pages/management/FuelImportPage.tsx');
    expect(page).toMatch(/\bfetchOperatorOptions\b/);
  });
});
