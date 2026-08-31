import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * A load save must not re-key its charges.
 *
 * The reported defect: `update_load_with_stops` DELETEd every load_charges row
 * and re-inserted from the payload, so a note edit, an appointment change or a
 * commodity correction handed every surviving charge a brand new id. Anything
 * pointing at a charge — detention_claims.resulting_charge_id, a proof document
 * link, a settlement line item — silently lost its target.
 *
 * The RPC now diffs: same id and unchanged means untouched, changed means
 * UPDATE in place, no id means INSERT, absent means DELETE.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __chargeIdentityFake: { client: unknown } };
holder.__chargeIdentityFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__chargeIdentityFake.client; },
}));

beforeEach(() => fake.reset());

type Rpc = (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = () => (fake.client as { rpc: Rpc }).rpc;

const chargesOf = (loadId: string) =>
  (fake.tables.load_charges ?? []).filter(c => c.load_id === loadId);

async function baseValues() {
  const { loadFormDefaults } = await import('@/pages/dispatch/loadFormSchema');
  const base = loadFormDefaults();
  return {
    ...base,
    load_number: 'ST26300',
    linehaul_rate: '1800',
    stops: [
      { ...base.stops[0], city: 'Kansas City', state: 'MO' },
      { ...base.stops[1], city: 'Dallas', state: 'TX' },
    ],
    charges: [],
  } as never;
}

/** A two-stop load carrying two load-level charges. */
async function seedLoadWithCharges() {
  const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
  const values = await baseValues();
  const created = buildLoadSavePayload(values, { isEdit: false });
  const { data: loadId, error } = await rpc()('create_load_with_stops', {
    p_load: created.load, p_stops: created.stops, p_charges: created.charges,
  });
  if (error) throw error;

  const { addLoadCharge } = await import('@/lib/loadCharges');
  const detentionId = await addLoadCharge(loadId as string, {
    chargeType: 'detention', amount: '150', description: 'Detention at the receiver',
    reason: 'Agreed with the broker', funding_source: '', actual_cost: '', proof_document_id: '',
  });
  const lumperId = await addLoadCharge(loadId as string, {
    chargeType: 'reimbursement', amount: '125', description: 'Lumper paid on site',
    reason: 'Driver paid out of pocket', funding_source: 'driver', actual_cost: '125',
    proof_document_id: '',
  });
  return { loadId: loadId as string, detentionId, lumperId, values };
}

/** Rebuilds the form the way Load Detail does, from what is in the database. */
async function hydrate(loadId: string, values: unknown) {
  const v = values as Record<string, unknown>;
  return {
    ...v,
    charges: chargesOf(loadId)
      .filter(c => !c.load_stop_id)
      .map(c => ({
        id: String(c.id),
        charge_type: String(c.charge_type),
        description: c.description == null ? '' : String(c.description),
        amount: String(c.amount),
        source: String(c.source ?? 'manual'),
        funding_source: (c.funding_source ?? '') as '' | 'driver' | 'company',
        actual_cost: c.actual_cost == null ? '' : String(c.actual_cost),
        proof_document_id: c.proof_document_id == null ? '' : String(c.proof_document_id),
      })),
  };
}

async function save(loadId: string, values: unknown, reason: string | null = null) {
  const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
  const payload = buildLoadSavePayload(values as never, { isEdit: true });
  const { error } = await rpc()('update_load_with_stops', {
    p_load_id: loadId, p_load: payload.load, p_stops: payload.stops,
    p_charges: payload.charges, p_reason: reason,
  });
  if (error) throw error;
}

describe('a load save preserves charge identity', () => {
  it('leaves every charge id unchanged when an unrelated field changes', async () => {
    const { loadId, detentionId, lumperId, values } = await seedLoadWithCharges();
    const before = chargesOf(loadId).map(c => c.id);

    const v = await hydrate(loadId, values);
    await save(loadId, { ...v, internal_notes: 'Called the receiver about the dock' });

    const after = chargesOf(loadId).map(c => c.id);
    expect(after).toEqual(before);
    expect(after).toContain(detentionId);
    expect(after).toContain(lumperId);
  });

  it("keeps a detention claim's resulting_charge_id pointing at its money", async () => {
    const { loadId, detentionId, values } = await seedLoadWithCharges();
    (fake.tables.detention_claims ??= []).push({
      id: 'claim-1', load_id: loadId, resulting_charge_id: detentionId,
    } as never);

    const v = await hydrate(loadId, values);
    await save(loadId, { ...v, commodity: 'Frozen potatoes' });

    const claim = fake.tables.detention_claims.find(c => c.id === 'claim-1')!;
    expect(claim.resulting_charge_id).toBe(detentionId);
    expect(chargesOf(loadId).some(c => c.id === claim.resulting_charge_id)).toBe(true);
  });

  it('keeps a proof_document_id link on the charge it was filed against', async () => {
    const { loadId, lumperId, values } = await seedLoadWithCharges();
    const row = chargesOf(loadId).find(c => c.id === lumperId)!;
    row.proof_document_id = 'doc-1';

    const v = await hydrate(loadId, values);
    await save(loadId, { ...v, driver_facing_notes: 'Dock 14, ask for Ray' });

    const after = chargesOf(loadId).find(c => c.id === lumperId)!;
    expect(after.proof_document_id).toBe('doc-1');
  });

  it('updates a charge in place through the save path, same id', async () => {
    const { loadId, detentionId, values } = await seedLoadWithCharges();

    const v = await hydrate(loadId, values);
    const charges = (v.charges as Record<string, unknown>[]).map(c =>
      c.id === detentionId ? { ...c, amount: '225', description: 'Detention, 3 hours' } : c);
    await save(loadId, { ...v, charges }, 'Broker approved a third hour');

    const rows = chargesOf(loadId);
    expect(rows).toHaveLength(2);
    const detention = rows.find(c => c.id === detentionId)!;
    expect(Number(detention.amount)).toBe(225);
    expect(detention.description).toBe('Detention, 3 hours');
  });

  it('deletes exactly the charge removed from the payload', async () => {
    const { loadId, detentionId, lumperId, values } = await seedLoadWithCharges();

    const v = await hydrate(loadId, values);
    const charges = (v.charges as Record<string, unknown>[]).filter(c => c.id !== lumperId);
    await save(loadId, { ...v, charges }, 'Lumper was billed to the broker instead');

    const rows = chargesOf(loadId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(detentionId);
  });

  it('inserts a charge added through the payload without disturbing the others', async () => {
    const { loadId, detentionId, lumperId, values } = await seedLoadWithCharges();

    const v = await hydrate(loadId, values);
    const charges = [...(v.charges as Record<string, unknown>[]), {
      id: '', charge_type: 'layover', description: 'Layover overnight', amount: '200',
      source: 'manual', funding_source: '', actual_cost: '', proof_document_id: '',
    }];
    await save(loadId, { ...v, charges }, 'Layover agreed on the phone');

    const rows = chargesOf(loadId);
    expect(rows).toHaveLength(3);
    expect(rows.map(c => c.id)).toEqual(expect.arrayContaining([detentionId, lumperId]));
    expect(rows.find(c => c.charge_type === 'layover')!.amount).toBe(200);
  });

  it('preserves created_at and created_by on surviving rows', async () => {
    const { loadId, detentionId, values } = await seedLoadWithCharges();
    const before = chargesOf(loadId).find(c => c.id === detentionId)!;
    const createdAt = before.created_at;
    const createdBy = before.created_by;

    const v = await hydrate(loadId, values);
    await save(loadId, { ...v, bol_number: 'BOL-99812' });

    const after = chargesOf(loadId).find(c => c.id === detentionId)!;
    expect(after.created_at).toBe(createdAt);
    expect(after.created_by).toBe(createdBy);
  });
});
