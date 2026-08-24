import { describe, expect, it } from 'vitest';
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
