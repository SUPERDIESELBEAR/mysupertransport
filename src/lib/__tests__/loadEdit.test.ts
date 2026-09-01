import { describe, expect, it } from 'vitest';
import { financialChanges, loadToFormValues, removedStops, toLocalInput } from '@/lib/loadEdit';
import { buildLoadSavePayload } from '@/lib/loadSavePayload';
import { emptyStop, loadFormDefaults, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';

const baseStop = (over: Partial<ReturnType<typeof emptyStop>> = {}) => ({
  ...emptyStop('pickup'),
  city: 'Macon',
  state: 'GA',
  ...over,
});

const values = (over: Partial<LoadFormValues> = {}): LoadFormValues => ({
  ...loadFormDefaults(),
  linehaul_rate: '1000',
  stops: [baseStop({ id: 's1' }), baseStop({ id: 's2', stop_type: 'delivery' })],
  ...over,
});

describe('financialChanges', () => {
  it('reports nothing when only operational fields move', () => {
    const before = values();
    const after = values({ commodity: 'Paper', internal_notes: 'call ahead' });
    expect(financialChanges(before, after)).toEqual([]);
  });

  it('treats numerically equal rates as unchanged', () => {
    expect(financialChanges(values(), values({ linehaul_rate: '1000.00' }))).toEqual([]);
  });

  it('flags a linehaul change', () => {
    expect(financialChanges(values(), values({ linehaul_rate: '1150' }))).toContain('linehaul_rate');
  });

  it('flags a stop-off amount change on a middle stop', () => {
    const before = values({
      stops: [baseStop({ id: 's1' }), baseStop({ id: 's2' }), baseStop({ id: 's3', stop_type: 'delivery' })],
    });
    const after = values({
      stops: [
        baseStop({ id: 's1' }),
        baseStop({ id: 's2', stopoff_charge_amount: '75' }),
        baseStop({ id: 's3', stop_type: 'delivery' }),
      ],
    });
    expect(financialChanges(before, after)).toContain('stop-off charges');
  });

  it('flags an added load-level charge', () => {
    const after = values({
      charges: [{ charge_type: 'stopoff', description: 'Extra Stop', amount: '50', source: 'manual' }],
    });
    expect(financialChanges(values(), after)).toContain('additional charges');
  });
});

describe('removedStops', () => {
  it('reports only stops that disappeared, carrying the driver-data flag', () => {
    const before = values({
      stops: [
        baseStop({ id: 's1', has_driver_data: true }),
        baseStop({ id: 's2' }),
        baseStop({ id: 's3', stop_type: 'delivery' }),
      ],
    });
    const after = values({ stops: [baseStop({ id: 's1', has_driver_data: true }), baseStop({ id: 's3' })] });
    expect(removedStops(before, after)).toEqual([{ id: 's2', hasDriverData: false }]);
  });

  it('marks a removed stop that the driver already visited', () => {
    const before = values({
      stops: [baseStop({ id: 's1', has_driver_data: true }), baseStop({ id: 's2' })],
    });
    const after = values({ stops: [baseStop({ id: 's2' })] });
    expect(removedStops(before, after)).toEqual([{ id: 's1', hasDriverData: true }]);
  });

  it('ignores reordering — a moved stop is not a removed stop', () => {
    const before = values({ stops: [baseStop({ id: 's1' }), baseStop({ id: 's2' })] });
    const after = values({ stops: [baseStop({ id: 's2' }), baseStop({ id: 's1' })] });
    expect(removedStops(before, after)).toEqual([]);
  });
});

const editData = {
    load: {
      id: 'l1', load_number: 'ST-1042', load_type: 'standard', status: 'in_transit',
      linehaul_rate: 1000, fsc_bundled_into_linehaul: true, equipment_type: 'dry_van',
      handling_type: 'live_load_unload', rate_type: 'flat',
    },
    stops: [
      {
        id: 's1', stop_sequence: 1, stop_type: 'pickup', city: 'Attalla', state: 'AL',
        actual_arrival_at: '2026-01-05T14:04:00Z', stopoff_charge_amount: null,
      },
      {
        id: 's2', stop_sequence: 2, stop_type: 'delivery', city: 'Macon', state: 'GA',
        stopoff_charge_amount: null,
      },
    ],
    charges: [
      { id: 'c1', load_stop_id: null, charge_type: 'other', description: 'Extra Stop', amount: 50, source: 'parsed_rate_confirmation' },
      { id: 'c2', load_stop_id: 's2', charge_type: 'stopoff', description: 'Stop-off charge', amount: 75, source: 'manual' },
    ],
};

describe('loadToFormValues', () => {
  it('marks stops the driver has already checked into', () => {
    const v = loadToFormValues(editData as never);
    expect(v.stops[0].has_driver_data).toBe(true);
    expect(v.stops[1].has_driver_data).toBe(false);
  });

  it('lists only load-level charges — stop-attached ones live on their stop card', () => {
    const v = loadToFormValues(editData as never);
    expect(v.charges).toHaveLength(1);
    expect(v.charges[0].description).toBe('Extra Stop');
  });

  it('keeps stop ids so the server can reconcile rather than replace', () => {
    expect(loadToFormValues(editData as never).stops.map(s => s.id)).toEqual(['s1', 's2']);
  });
});

describe('toLocalInput', () => {
  it('returns an empty string for missing or invalid timestamps', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('not a date')).toBe('');
  });

  it('produces a datetime-local shaped value', () => {
    expect(toLocalInput('2026-01-05T14:04:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('fsc_bundled_into_linehaul tri-state', () => {
  it('is not a financial change when an unstated flag stays unstated', () => {
    const before = values({ fsc_bundled_into_linehaul: null });
    const after = values({ fsc_bundled_into_linehaul: null, commodity: 'Corn' });
    expect(financialChanges(before, after)).toEqual([]);
  });

  it('still flags a real turn-off', () => {
    expect(financialChanges(values({ fsc_bundled_into_linehaul: null }), values({ fsc_bundled_into_linehaul: false })))
      .toContain('fsc_bundled_into_linehaul');
  });

  it('sends an empty string so the RPC writes NULL back, not false', () => {
    const p = buildLoadSavePayload(values({ fsc_bundled_into_linehaul: null }), { isEdit: true });
    expect(p.load.fsc_bundled_into_linehaul).toBe('');
  });

  it('hydrates an unstated flag as null rather than true', () => {
    const v = loadToFormValues({ ...editData, load: { ...editData.load, fsc_bundled_into_linehaul: null } } as never);
    expect(v.fsc_bundled_into_linehaul).toBeNull();
  });
});
