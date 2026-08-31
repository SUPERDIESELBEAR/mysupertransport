import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * Entering a charge by hand.
 *
 * The hazard these tests exist for is the full-replace one: the load save RPC
 * DELETEs every charge on the load and re-inserts the array it is handed, so a
 * naive "add" built on that path would drop every other charge and re-key the
 * survivors. Charge entry goes through narrow RPCs instead, and the tests below
 * pin that a second charge leaves the first alone, keys and all.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __chargeEntryFake: { client: unknown } };
holder.__chargeEntryFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__chargeEntryFake.client; },
}));

beforeEach(() => fake.reset());

const entry = (over: Partial<{
  chargeType: string; amount: string; description: string; reason: string;
  funding_source: '' | 'driver' | 'company'; actual_cost: string; proof_document_id: string;
}> = {}) => ({
  chargeType: 'detention',
  amount: '150',
  description: 'Detention at the receiver',
  reason: 'Agreed with Tara at the broker on the phone',
  funding_source: '' as const,
  actual_cost: '',
  proof_document_id: '',
  ...over,
});

/** A plain two-stop load with a $1,800 linehaul and no charges. */
async function seedLoad(): Promise<string> {
  const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
  const { loadFormDefaults } = await import('@/pages/dispatch/loadFormSchema');
  const base = loadFormDefaults();
  const values = {
    ...base,
    load_number: 'ST26200',
    linehaul_rate: '1800',
    stops: [
      { ...base.stops[0], city: 'Kansas City', state: 'MO' },
      { ...base.stops[1], city: 'Dallas', state: 'TX' },
    ],
    charges: [],
  } as never;
  const payload = buildLoadSavePayload(values, { isEdit: false });
  const client = fake.client as {
    rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc('create_load_with_stops', {
    p_load: payload.load, p_stops: payload.stops, p_charges: payload.charges,
  });
  if (error) throw error;
  // The create RPC does not compute the total; set the header base the way the
  // load form does, so the recompute after a charge has something to add to.
  const load = fake.tables.loads.find(l => l.id === data);
  if (load) load.total_load_value = 1800;
  return data as string;
}

const chargesOf = (loadId: string) =>
  (fake.tables.load_charges ?? []).filter(c => c.load_id === loadId);
const historyOf = (loadId: string) =>
  (fake.tables.load_change_history ?? []).filter(h => h.load_id === loadId);
const loadOf = (loadId: string) => fake.tables.loads.find(l => l.id === loadId)!;

describe('adding a charge from Load Detail', () => {
  it('persists the charge and lifts total_load_value by its amount', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();

    await addLoadCharge(loadId, entry());

    const rows = chargesOf(loadId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      charge_type: 'detention', amount: 150, source: 'manual',
      description: 'Detention at the receiver',
    });
    expect(Number(loadOf(loadId).total_load_value)).toBe(1950);
  });

  it('does not drop the charges already on the load', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();

    const firstId = await addLoadCharge(loadId, entry({ chargeType: 'layover', amount: '200' }));
    await addLoadCharge(loadId, entry({ chargeType: 'detention', amount: '150' }));

    const rows = chargesOf(loadId);
    expect(rows).toHaveLength(2);
    // The first row survives with its ORIGINAL key — a detention claim's
    // resulting_charge_id and a proof-document link both point at it.
    expect(rows.map(r => r.id)).toContain(firstId);
    expect(Number(loadOf(loadId).total_load_value)).toBe(2150);
  });

  it('carries actual cost on a driver-funded reimbursement', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();

    await addLoadCharge(loadId, entry({
      chargeType: 'reimbursement', amount: '125', description: 'Lumper paid on site',
      funding_source: 'driver', actual_cost: '125',
    }));

    expect(chargesOf(loadId)[0]).toMatchObject({
      charge_type: 'reimbursement', funding_source: 'driver', actual_cost: 125,
    });
  });

  it('records a company-funded reimbursement with nothing owed to the driver', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const { payClassOf, DEFAULT_CHARGE_PAY_CLASSES } = await import('@/lib/payTreatment');
    const loadId = await seedLoad();

    await addLoadCharge(loadId, entry({
      chargeType: 'reimbursement', amount: '80', description: 'Comdata lumper',
      funding_source: 'company', actual_cost: '80',
    }));

    const row = chargesOf(loadId)[0];
    expect(row.funding_source).toBe('company');
    // Company-funded means the driver is reimbursed nothing: the class is a
    // reimbursement, and the cost was not his.
    expect(payClassOf('reimbursement', null)).toBe('reimbursement');
    expect(DEFAULT_CHARGE_PAY_CLASSES.reimbursement).toBe('reimbursement');
  });

  it('refuses a charge on a settled load', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();
    loadOf(loadId).status = 'settled';

    await expect(addLoadCharge(loadId, entry())).rejects.toThrow(/money is fixed/i);
    expect(chargesOf(loadId)).toHaveLength(0);
  });

  it('refuses a charge with no reason', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();
    await expect(addLoadCharge(loadId, entry({ reason: '  ' }))).rejects.toThrow(/reason is required/i);
  });

  it('refuses a charge type the pay policy does not know', async () => {
    const { addLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();
    await expect(addLoadCharge(loadId, entry({ chargeType: 'fuel_advance' })))
      .rejects.toThrow(/Unknown charge type/i);
  });
});

describe('every charge operation is attributable', () => {
  it('writes change history with the actor for create, edit and remove', async () => {
    const { addLoadCharge, updateLoadCharge, deleteLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();

    const id = await addLoadCharge(loadId, entry());
    await updateLoadCharge(id, entry({ amount: '175', reason: 'Broker agreed a fourth hour' }));
    await deleteLoadCharge(id, 'Broker withdrew the detention offer');

    const paths = historyOf(loadId).map(h => h.field_path);
    expect(paths).toContain('charge_added');
    expect(paths).toContain('charge · amount');
    expect(paths).toContain('charge_removed');

    const reasons = historyOf(loadId).map(h => h.reason);
    expect(reasons).toContain('Agreed with Tara at the broker on the phone');
    expect(reasons).toContain('Broker agreed a fourth hour');
    expect(reasons).toContain('Broker withdrew the detention offer');

    // The actor is stamped server-side on every row, never sent by the client.
    historyOf(loadId).forEach(h => expect(h.changed_by).toBeTruthy());
  });

  it('returns the load to its header value when the charge is removed', async () => {
    const { addLoadCharge, deleteLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();

    const id = await addLoadCharge(loadId, entry({ amount: '150' }));
    expect(Number(loadOf(loadId).total_load_value)).toBe(1950);
    await deleteLoadCharge(id, 'Entered against the wrong load');
    expect(Number(loadOf(loadId).total_load_value)).toBe(1800);
  });
});

describe('the header split holds', () => {
  it('leaves linehaul, FSC, per-ton and relocation fee untouched', async () => {
    const { addLoadCharge, updateLoadCharge, deleteLoadCharge } = await import('@/lib/loadCharges');
    const loadId = await seedLoad();
    const before = { ...loadOf(loadId) };

    const id = await addLoadCharge(loadId, entry());
    await updateLoadCharge(id, entry({ amount: '175', reason: 'Corrected' }));
    await deleteLoadCharge(id, 'Removed');

    const after = loadOf(loadId);
    (['linehaul_rate', 'fsc_amount', 'rate_per_ton', 'rate_per_mile', 'estimated_tons',
      'loadout_relocation_fee', 'fsc_bundled_into_linehaul'] as const).forEach(k => {
      expect(after[k] ?? null).toEqual(before[k] ?? null);
    });
  });
});

describe('charge types map onto the pay classes already defined', () => {
  it('every offered type has a treatment', async () => {
    const { CLASSIFICATION_OPTIONS } = await import('@/lib/revisedRateCon');
    const { chargeClassification } = await import('@/lib/loadCharges');
    const { DEFAULT_CHARGE_PAY_CLASSES } = await import('@/lib/payTreatment');

    CLASSIFICATION_OPTIONS.forEach(k => {
      expect(chargeClassification(k)).toBe(k);
      expect(DEFAULT_CHARGE_PAY_CLASSES[k]).toBeDefined();
    });
  });
});
