import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * Reader-boundary cover for the Charges card.
 *
 * A new card reading a persisted structure with no rendering test is exactly
 * what produced the blank Load Detail page, so the rows here are written
 * through the real save path — form values → `buildLoadSavePayload` →
 * `create_load_with_stops` — and read back through the card's own query. The
 * reader's fixture is the writer's output.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __chargesCardFake: { client: unknown } };
holder.__chargesCardFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__chargesCardFake.client; },
}));

beforeEach(() => fake.reset());

/** Writes a load whose charges include one unconfirmed and one confirmed reimbursement. */
async function seedLoad(): Promise<string> {
  const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
  const { loadFormDefaults } = await import('@/pages/dispatch/loadFormSchema');
  const base = loadFormDefaults();

  const values = {
    ...base,
    load_number: 'ST26099',
    linehaul_rate: '1800',
    stops: [
      { ...base.stops[0], city: 'Kansas City', state: 'MO' },
      { ...base.stops[1], city: 'Dallas', state: 'TX' },
    ],
    charges: [
      // Reimbursement with all three facts null — the incomplete state.
      {
        charge_type: 'reimbursement', description: 'Trailer washout', amount: '30',
        source: 'parsed_rate_confirmation',
        funding_source: '' as const, actual_cost: '', proof_document_id: '',
      },
      // Fully confirmed, driver-funded. Deliberately NOT a lumper: lumper stays in
      // the revenue class by default, so a driver-paid lumper only becomes a
      // reimbursement when someone reclassifies it explicitly.
      {
        charge_type: 'reimbursement', description: 'Lumper at receiver', amount: '125',
        source: 'manual',
        funding_source: 'driver' as const, actual_cost: '125', proof_document_id: '',
      },
      // A revenue charge, to prove the reimbursement treatment is not applied to everything.
      {
        charge_type: 'detention', description: 'Detention at shipper', amount: '150',
        source: 'manual',
        funding_source: '' as const, actual_cost: '', proof_document_id: '',
      },
    ],
  } as never;

  const payload = buildLoadSavePayload(values, { isEdit: false });
  const client = fake.client as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc('create_load_with_stops', {
    p_load: payload.load, p_stops: payload.stops, p_charges: payload.charges,
  });
  if (error) throw error;
  return data as string;
}

async function renderCard(loadId: string, canEdit = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { default: Card } = await import('../LoadChargesCard');
  return render(
    <QueryClientProvider client={qc}>
      <Card loadId={loadId} operatorId={null} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe('LoadChargesCard against real query output', () => {
  it('renders stored charges with their pay treatment', async () => {
    const loadId = await seedLoad();
    await renderCard(loadId);

    expect(await screen.findByText('Trailer washout')).toBeInTheDocument();
    expect(screen.getByText('Lumper at receiver')).toBeInTheDocument();
    expect(screen.getByText('Detention at shipper')).toBeInTheDocument();

    // Reimbursement reads as a cost, not a percentage; detention keeps its percentage.
    expect(screen.getAllByText(/reimbursed at cost/).length).toBe(2);
    expect(screen.getByText(/100% to driver/)).toBeInTheDocument();
  });

  it('shows which facts a reimbursement is still missing', async () => {
    const loadId = await seedLoad();
    await renderCard(loadId);

    expect(
      await screen.findByText(/still missing funding source, actual cost, proof document/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 reimbursement.* unconfirmed|reimbursements unconfirmed/)).toBeInTheDocument();
  });

  it('states what a confirmed funding source means for the driver', async () => {
    const loadId = await seedLoad();
    await renderCard(loadId);

    expect(
      await screen.findByText(/Driver-funded: the driver is reimbursed the actual cost/),
    ).toBeInTheDocument();
  });

  it('offers the three reimbursement fields to staff who can edit', async () => {
    const loadId = await seedLoad();
    await renderCard(loadId, true);

    expect(await screen.findAllByText('Funding source')).toHaveLength(2);
    expect(screen.getAllByText('Actual cost')).toHaveLength(2);
    expect(screen.getAllByText('Proof document')).toHaveLength(2);
  });
});
