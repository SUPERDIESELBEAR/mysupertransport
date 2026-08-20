import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FacilitySelect from '@/components/dispatch/loadForm/FacilitySelect';
import type { Facility } from '@/lib/facilities';

// cmdk observes its list container; jsdom has no ResizeObserver.
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

function renderPicker(name: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FacilitySelect
        facilityId=""
        facilityName={name}
        onNameChange={() => {}}
        onSelectFacility={() => {}}
        onClearFacility={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('FacilitySelect add action', () => {
  it('keeps the add action mounted when the query matches no saved facility', async () => {
    const user = userEvent.setup();
    // The controlled name is already a non-matching query, so cmdk filters the
    // saved list to nothing the moment the list renders — the exact state that
    // previously hid "Add new facility" (its value "__add__" never matches).
    renderPicker('J M Exotic Foods');

    await user.click(screen.getByRole('combobox'));

    // The real defect condition: no saved facility survived the filter…
    expect(screen.queryByText('Gadsden Warehousing')).not.toBeInTheDocument();
    expect(screen.getByText(/No saved facility matches/)).toBeInTheDocument();
    // …yet the create action is still reachable.
    expect(screen.getByTestId('facility-add-new')).toBeInTheDocument();
    expect(screen.getByText('Add “J M Exotic Foods” as a new facility')).toBeInTheDocument();
  });
});
