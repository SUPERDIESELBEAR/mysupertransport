import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * The section shows EVIDENCE, never a computation. A stop with no recorded
 * arrival must say so — a blank there reads as "nothing to worry about" while
 * being exactly the claim a broker will refuse.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }));

import DetentionSection from '../DetentionSection';
import { raiseDetentionClaim } from '@/lib/detentionClaims';
import { EMPTY_DETENTION_TERMS, type DetentionTerms } from '@/lib/detentionTerms';

const stops = [{
  id: 'stop-a',
  load_id: 'load-1',
  stop_sequence: 1,
  stop_type: 'pickup',
  facility_name: 'Cargill Elevator',
  appointment_start: '2026-08-27T14:00:00.000Z',
  appointment_end: '2026-08-27T16:00:00.000Z',
  actual_arrival_at: null,
  actual_departure_at: null,
  arrival_source: null,
  departure_source: null,
  arrival_recorded_by: null,
  departure_recorded_by: null,
}];

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DetentionSection loadId="load-1" stops={stops as never} canManage />
    </QueryClientProvider>,
  );
}

beforeEach(() => fake.reset());

describe('DetentionSection', () => {
  it('renders the missing-evidence state rather than a blank', async () => {
    await raiseDetentionClaim({
      loadId: 'load-1', loadStopId: 'stop-a', driverReportedAt: '2026-08-27T09:30',
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('No arrival recorded')).toBeInTheDocument());
    expect(screen.getByText('No departure recorded')).toBeInTheDocument();
    expect(screen.getByText(/Appointment:/)).toBeInTheDocument();
  });

  it('shows no computed detention duration or amount anywhere', async () => {
    await raiseDetentionClaim({
      loadId: 'load-1', loadStopId: 'stop-a', driverReportedAt: '2026-08-27T09:30',
    });
    const { container } = renderSection();
    await waitFor(() => expect(screen.getByText('No arrival recorded')).toBeInTheDocument());
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\$/);
    expect(text).not.toMatch(/detention hours|eligible/i);
  });
});

/**
 * TERMS BLOCK. What a rate confirmation did not say must read as silence, not
 * as a zero — a dispatcher quoting "no free time" off a blank field is a worse
 * outcome than having no block at all.
 */
function renderWithTerms(terms: Partial<DetentionTerms>, withClaim = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DetentionSection
        loadId="load-1"
        stops={stops as never}
        canManage
        terms={{ ...EMPTY_DETENTION_TERMS, ...terms }}
      />
    </QueryClientProvider>,
  );
}

describe('DetentionSection terms block', () => {
  it('says the confirmation stated no terms when every field is null', async () => {
    renderWithTerms({});
    await waitFor(() =>
      expect(screen.getByText('This rate confirmation states no detention terms.'))
        .toBeInTheDocument());
    expect(screen.queryByText('Free time')).not.toBeInTheDocument();
  });

  it('shows stated terms and marks the unstated ones "Not stated"', async () => {
    renderWithTerms({ freeTimeMinutes: 120, ratePerHour: 50 });
    await waitFor(() => expect(screen.getByText('120 minutes (2 hours)')).toBeInTheDocument());
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    // Daily cap, clock start and notification were not stated.
    expect(screen.getAllByText('Not stated')).toHaveLength(3);
    expect(screen.queryByText('This rate confirmation states no detention terms.'))
      .not.toBeInTheDocument();
  });

  it('prompts when notification is required and the open claim records none', async () => {
    await raiseDetentionClaim({
      loadId: 'load-1', loadStopId: 'stop-a', driverReportedAt: '2026-08-27T09:30',
    });
    renderWithTerms({ notificationRequired: true });
    await waitFor(() => expect(screen.getByText(/require notifying the broker/i))
      .toBeInTheDocument());
  });

  it('stays quiet when the terms do not state a notification requirement', async () => {
    await raiseDetentionClaim({
      loadId: 'load-1', loadStopId: 'stop-a', driverReportedAt: '2026-08-27T09:30',
    });
    renderWithTerms({ notificationRequired: null, freeTimeMinutes: 60 });
    await waitFor(() => expect(screen.getByText('60 minutes (1 hour)')).toBeInTheDocument());
    expect(screen.queryByText(/require notifying the broker/i)).not.toBeInTheDocument();
  });
});
