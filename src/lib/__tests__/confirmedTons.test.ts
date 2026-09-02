import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { financialChanges } from '@/lib/loadEdit';
import { buildLoadSavePayload } from '@/lib/loadSavePayload';
import { emptyStop, loadFormDefaults, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';

const perTon = (over: Partial<LoadFormValues> = {}): LoadFormValues => ({
  ...loadFormDefaults(),
  rate_type: 'per_ton',
  rate_per_ton: '270',
  estimated_tons: '25',
  confirmed_tons: '',
  stops: [emptyStop('pickup'), emptyStop('delivery')],
  ...over,
});

const source = readFileSync('src/pages/dispatch/CreateLoadPage.tsx', 'utf8');

describe('confirmed_tons input control', () => {
  it('renders only inside the per_ton branch and only when editing', () => {
    const perTonBlock = source.slice(
      source.indexOf("values.rate_type === 'per_ton' && ("),
      source.indexOf('name="fsc_bundled_into_linehaul"'),
    );
    expect(perTonBlock).toContain('name="confirmed_tons"');
    // The control sits behind the isEdit gate that immediately precedes it.
    const gate = perTonBlock.slice(0, perTonBlock.indexOf('name="confirmed_tons"'));
    expect(gate.lastIndexOf('{isEdit && (')).toBeGreaterThan(gate.lastIndexOf('name="estimated_tons"'));
  });

  it('is the only confirmed_tons control on the form', () => {
    expect(source.match(/name="confirmed_tons"/g)).toHaveLength(1);
  });

  it('sends an empty string so the RPC nullif()s it to NULL, never 0', () => {
    const p = buildLoadSavePayload(perTon(), { isEdit: true });
    expect(p.load.confirmed_tons).toBe('');
    expect(p.load.confirmed_tons).not.toBe('0');
  });

  it('sends the entered figure through the existing payload', () => {
    const p = buildLoadSavePayload(perTon({ confirmed_tons: '24.62' }), { isEdit: true });
    expect(p.load.confirmed_tons).toBe('24.62');
  });

  it('setting confirmed tons leaves linehaul_rate and estimated_tons alone', () => {
    const before = perTon({ linehaul_rate: '6750' });
    const after = perTon({ linehaul_rate: '6750', confirmed_tons: '25' });
    const p = buildLoadSavePayload(after, { isEdit: true });
    expect(p.load.linehaul_rate).toBe(before.linehaul_rate);
    expect(p.load.estimated_tons).toBe('25');
    expect(financialChanges(before, after)).toEqual(['confirmed_tons']);
  });

  it('clearing a confirmed figure is itself a financial change requiring a reason', () => {
    expect(financialChanges(perTon({ confirmed_tons: '25' }), perTon({ confirmed_tons: '' })))
      .toContain('confirmed_tons');
  });
});
