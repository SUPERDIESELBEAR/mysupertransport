import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerContactsSection from '@/components/dispatch/broker/BrokerContactsSection';
import BrokerNotesSection from '@/components/dispatch/broker/BrokerNotesSection';
import BrokerDoNotLoadFields from '@/components/dispatch/broker/BrokerDoNotLoadFields';

/**
 * READER BOUNDARY — these components are rendered against the shape the real
 * queries return (embedded profiles relation included), not a shape invented
 * for the test. A reader that only ever sees a hand-made object is how the
 * verbatim_verification crash shipped.
 */

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const CONTACT_ROWS = [
  {
    id: 'c1', broker_id: 'b1', name: 'Dana Reed', role: 'accounts_payable',
    phone: '8165551212', email: 'ap@blue.example', notes: 'Invoices by email only',
    is_primary: false, created_at: '2026-08-25T12:00:00Z', created_by: 'p1',
  },
  {
    id: 'c2', broker_id: 'b1', name: 'Sam Cole', role: 'dispatch',
    phone: null, email: null, notes: null,
    is_primary: true, created_at: '2026-08-25T12:00:00Z', created_by: 'p1',
  },
];

// Exactly what PostgREST returns for the embedded profiles relation: an object,
// not an array, and full_name does not exist on profiles.
const NOTE_ROWS = [
  {
    id: 'n1', broker_id: 'b1', body: 'Detention takes three calls to approve.',
    created_at: '2026-08-25T15:00:00Z', updated_at: '2026-08-25T15:00:00Z',
    created_by: 'p1', author: { first_name: 'Marcus', last_name: 'Mueller' },
  },
  {
    id: 'n2', broker_id: 'b1', body: 'Rate con arrived without a reference number.',
    created_at: '2026-08-24T15:00:00Z', updated_at: '2026-08-24T15:00:00Z',
    created_by: null, author: null,
  },
];

const DNL_ROWS = [
  {
    id: 'h1', previous_value: false, new_value: true, reason: 'Short-paid twice',
    changed_at: '2026-08-25T16:00:00Z', actor: { first_name: 'Marcus', last_name: 'Mueller' },
  },
];

function tableStub(rows: unknown[]) {
  // Awaiting the builder resolves to { data, error } like the real client, and
  // every filter/order call returns the same thenable so chains of any length work.
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return chain;
}


vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'broker_contacts') return tableStub(CONTACT_ROWS);
      if (table === 'broker_notes') return tableStub(NOTE_ROWS);
      if (table === 'broker_do_not_load_history') return tableStub(DNL_ROWS);
      return tableStub([]);
    },
  },
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('broker relationship readers', () => {
  it('renders contacts with role labels and the primary marker', async () => {
    wrap(<BrokerContactsSection brokerId="b1" />);
    await waitFor(() => expect(screen.getByText('Dana Reed')).toBeInTheDocument());
    expect(screen.getByText(/Accounts Payable/)).toBeInTheDocument();
    expect(screen.getByText(/\(816\) 555-1212/)).toBeInTheDocument();
    expect(screen.getByText('Sam Cole')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('attributes each note and never collapses them into one blob', async () => {
    wrap(<BrokerNotesSection brokerId="b1" legacyNotes="Address read from Bill To block." />);
    await waitFor(() =>
      expect(screen.getByText('Detention takes three calls to approve.')).toBeInTheDocument());
    expect(screen.getByText('Rate con arrived without a reference number.')).toBeInTheDocument();
    expect(screen.getByText(/Marcus Mueller/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown staff/)).toBeInTheDocument();
  });

  it('shows the legacy blob read-only with a pointer to the new note field', async () => {
    wrap(<BrokerNotesSection brokerId="b1" legacyNotes="Address read from Bill To block." />);
    expect(screen.getByText(/Legacy note \(read-only\)/)).toBeInTheDocument();
    expect(screen.getByText(/Notes are now added below/)).toBeInTheDocument();
    const editable = screen.getAllByRole('textbox');
    expect(editable).toHaveLength(1);
    await waitFor(() => expect(screen.getByLabelText('Add a note')).toBeInTheDocument());
  });

  it('renders do-not-load history with actor and reason', async () => {
    wrap(
      <BrokerDoNotLoadFields
        brokerId="b1"
        doNotLoad
        onDoNotLoadChange={() => {}}
        reason="Short-paid twice"
        onReasonChange={() => {}}
        rating={4}
        onRatingChange={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Flagged .* by Marcus Mueller — Short-paid twice/)).toBeInTheDocument());
  });
});
