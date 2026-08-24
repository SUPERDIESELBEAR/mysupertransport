import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pickReference } from '@/lib/rateConfirmation';
import { planLoadTypeCarry } from '@/lib/loadTypeCarry';
import { isPlaceholderReferenceValue, classifyReferences } from '@/lib/referenceClasses';

describe('load type change carries the parsed amount', () => {
  it('moves a linehaul rate into the relocation fee', () => {
    const c = planLoadTypeCarry('standard', 'loadout', { linehaul_rate: '150' });
    expect(c.toField).toBe('loadout_relocation_fee');
    expect(c.amount).toBe('150');
    expect(c.conflicts).toBe(false);
  });

  it('moves a relocation fee back into the linehaul rate', () => {
    const c = planLoadTypeCarry('loadout', 'standard', { loadout_relocation_fee: '150' });
    expect(c.toField).toBe('linehaul_rate');
  });

  it('does not overwrite a different amount already entered', () => {
    const c = planLoadTypeCarry('standard', 'loadout', {
      linehaul_rate: '150', loadout_relocation_fee: '900',
    });
    expect(c.conflicts).toBe(true);
  });

  it('is a no-op between two types that share an amount field', () => {
    expect(planLoadTypeCarry('standard', 'per_ton', { linehaul_rate: '150' }).toField).toBeNull();
  });
});

describe('placeholder reference values', () => {
  it('recognises instruction text printed where a number goes', () => {
    for (const v of ['Assign at pickup', 'TBD', 'to be assigned', 'N/A', 'See BOL']) {
      expect(isPlaceholderReferenceValue(v)).toBe(true);
    }
  });

  it('leaves a real reference alone even when it contains a placeholder word', () => {
    expect(isPlaceholderReferenceValue('TBD-99201')).toBe(false);
  });

  it('drops the placeholder row instead of filing a phantom reference', () => {
    const out = classifyReferences([
      { label: 'PU Number', value: 'Assign at pickup', stopSequence: 1 },
      { label: 'PU Number', value: '778201', stopSequence: 2 },
    ]);
    expect(out.references.map(r => r.value)).toEqual(['778201']);
    expect(out.dropped.some(d => d.value === 'Assign at pickup')).toBe(true);
  });
});

describe('stop reference numbers go through the placeholder vocabulary', () => {
  const ref = (value: string, label = 'PU Number') => ({
    label, value, confidence: 'high' as const,
  });

  it('drops instruction text printed where a stop number goes', () => {
    expect(pickReference([ref('Assign at pickup')])).toBeNull();
  });

  it('still returns a real stop reference', () => {
    expect(pickReference([ref('778201')])?.value).toBe('778201');
  });

  it('prefers the real reference when both are printed on the stop', () => {
    expect(pickReference([ref('TBD'), ref('778201')])?.value).toBe('778201');
  });
});

describe('the load type has exactly one writer', () => {
  const SRC = resolve(__dirname, '../..');
  const HOOK = 'components/dispatch/loadForm/useLoadTypeChange.ts';

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
    }
    return out;
  };

  /**
   * The banner bypassed the amount carry by writing `load_type` itself. A third
   * caller doing the same would reintroduce it silently, so the single writer
   * is asserted structurally rather than trusted.
   */
  it('no file outside the hook writes load_type through the form', () => {
    const offenders = walk(SRC)
      .filter(f => !f.endsWith(HOOK))
      .filter(f => /set(Value)?\(\s*['"`]load_type['"`]/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
