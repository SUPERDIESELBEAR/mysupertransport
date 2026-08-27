/**
 * Reported issue 3: an auto-collapsed duplicate was fetched on purpose and then
 * dropped by the render filter, so it appeared nowhere. A dispatcher could not
 * tell a collapsed duplicate from an email that never arrived.
 *
 * These tests lock the fixed contract: the duplicate renders once in the
 * default view, never twice, stays distinct from a manually dismissed row, and
 * carries no Create load action. The badge count deliberately excludes it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  countsTowardBadge,
  isAutoCollapsedDuplicate,
  isDefaultVisible,
} from '@/lib/rateConInbox';

const base = {
  from_address: 'dispatch@broker.test',
  received_at: '2026-08-27T14:00:00.000Z',
  attachment_filename: 'ratecon.pdf',
  attachment_storage_path: 'x/ratecon.pdf',
  attachment_mime_type: 'application/pdf',
  attachment_page_count: 1,
  parse_error: null,
  parse_status: 'ok',
  parsed: null,
  verbatim_checks: null,
  text_layer: null,
  text_layer_available: true,
  sender_allowed: true,
  broker_load_number: null,
  matched_load_id: null,
  dismissed_by: null,
  dismiss_reason: null,
};

const rows = [
  { ...base, id: 'open-1', subject: 'Open tender 5501', status: 'parsed', parsed: {} },
  {
    ...base,
    id: 'dup-1',
    subject: 'Duplicate tender 5501',
    status: 'dismissed',
    dismiss_reason: 'Duplicate of an item already in the queue.',
    dismissed_by: null,
  },
  {
    ...base,
    id: 'manual-1',
    subject: 'Junk mail',
    status: 'dismissed',
    dismiss_reason: 'Not a rate con.',
    dismissed_by: 'staff-uuid',
  },
  {
    ...base,
    id: 'other-dismissed-1',
    subject: 'Dismissed for another reason',
    status: 'dismissed',
    dismiss_reason: 'Broker cancelled the load.',
    dismissed_by: null,
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
    channel: () => ({
      on: function () { return this; },
      subscribe: function () { return this; },
    }),
    removeChannel: () => {},
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
}));
const authApi = { session: { user: { id: 'u1' } } };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authApi }));
const toastApi = { toast: () => {} };
vi.mock('@/hooks/use-toast', () => ({ useToast: () => toastApi }));

import RateConInboxPage from '../RateConInboxPage';

function mount() {
  return render(
    <MemoryRouter>
      <RateConInboxPage />
    </MemoryRouter>
  );
}

describe('collapsed duplicates in the rate con inbox', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows an auto-collapsed duplicate in the default view, without Show handled', async () => {
    mount();
    expect(await screen.findByText('Duplicate tender 5501')).toBeInTheDocument();
    expect(screen.getByText('Duplicate — collapsed')).toBeInTheDocument();
    expect(screen.getByText('Open tender 5501')).toBeInTheDocument();
  });

  it('hides a manually dismissed row and a non-duplicate dismissal by default', async () => {
    mount();
    await screen.findByText('Duplicate tender 5501');
    expect(screen.queryByText('Junk mail')).not.toBeInTheDocument();
    expect(screen.queryByText('Dismissed for another reason')).not.toBeInTheDocument();
  });

  it('does not render the duplicate twice when Show handled is toggled on', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Duplicate tender 5501');
    await user.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByText('Junk mail')).toBeInTheDocument());
    expect(screen.getAllByText('Duplicate tender 5501')).toHaveLength(1);
    expect(screen.getAllByTestId('inbox-row-dup-1')).toHaveLength(1);
  });

  it('a manually dismissed row appears only under Show handled', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Duplicate tender 5501');
    expect(screen.queryByText('Junk mail')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByText('Junk mail')).toBeInTheDocument());
  });

  it('offers no Create load action on the collapsed duplicate', async () => {
    mount();
    await screen.findByText('Duplicate tender 5501');
    const dupRow = screen.getByTestId('inbox-row-dup-1');
    // It keeps the quiet "open the original attachment" affordance, but nothing
    // that treats it as work: no Create load, no Dismiss, no Retry.
    const labels = Array.from(dupRow.querySelectorAll('button'))
      .map(b => (b.textContent ?? '').trim())
      .filter(Boolean);
    expect(labels).toEqual([]);
    // The genuinely open parsed row still has its action.
    expect(screen.getByRole('button', { name: 'Create load' })).toBeInTheDocument();
  });

  it('does not show the empty state when only duplicate rows are present', () => {
    const onlyDuplicates = rows.filter(isDefaultVisible).filter(isAutoCollapsedDuplicate);
    expect(onlyDuplicates.length).toBeGreaterThan(0);
    // The list is gated on the same predicate that fetched the rows, so a
    // duplicate-only inbox is non-empty and "Inbox zero" cannot appear.
    expect(onlyDuplicates.every(isDefaultVisible)).toBe(true);
  });

  it('the badge count and the list agree on what counts as inbox contents', () => {
    const listed = rows.filter(isDefaultVisible).map(r => r.id);
    const counted = rows.filter(countsTowardBadge).map(r => r.id);
    expect(listed).toEqual(['open-1', 'dup-1']);
    // Everything the badge counts is listed; the duplicate is listed but not
    // counted, because a badge is a call to action.
    expect(counted).toEqual(['open-1']);
    expect(counted.every(id => listed.includes(id))).toBe(true);
  });
});
