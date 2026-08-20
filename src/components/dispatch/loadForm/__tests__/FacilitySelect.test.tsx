import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FacilitySelect from '@/components/dispatch/loadForm/FacilitySelect';
import type { Facility } from '@/lib/facilities';

// cmdk observes its list container and scrolls the active item; jsdom has neither.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

vi.mock('@/components/facilities/FacilityDialog', () => ({
  __esModule: true,
  default: () => null,
}));

const facility = (name: string, city: string): Facility => ({
  id: name, facility_name: name, address_line1: '1 Main St', address_line2: null,
  city, state: 'AL', zip: '35004', contact_name: null, contact_phone: null,
  contact_email: null, facility_type: null, default_appointment_required: false,
  hours_notes: null, access_notes: null, times_used: 0, last_used_at: null,
  is_active: true, notes: null,
});

vi.mock('@/hooks/useFacilities', () => ({
  FACILITIES_QUERY_KEY: ['facilities', 'active'],
  useFacilities: () => ({ data: [facility('Gadsden Warehousing', 'Attalla')] }),
}));

/** Mirrors how StopsSection drives the picker: controlled name held by the form. */
function Harness() {
  const [name, setName] = useState('');
  return (
    <FacilitySelect
      facilityId=""
      facilityName={name}
      onNameChange={setName}
      onSelectFacility={() => {}}
      onClearFacility={() => {}}
    />
  );
}

function renderPicker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('FacilitySelect add action', () => {
  it('keeps the add action reachable after typing a query with no matches', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('combobox'));
    // Sanity: the saved facility is listed before any query narrows the list.
    expect(screen.getByText('Gadsden Warehousing')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search or type a facility name/), 'J M Exotic');

    // The real defect condition: cmdk filtered every saved facility away…
    expect(screen.queryByText('Gadsden Warehousing')).not.toBeInTheDocument();
    expect(screen.getByText(/No saved facility matches/)).toBeInTheDocument();
    // …and the create action must survive that same filter.
    expect(screen.getByTestId('facility-add-new')).toBeInTheDocument();
    expect(screen.getByText('Add “J M Exotic” as a new facility')).toBeInTheDocument();
  });
});
