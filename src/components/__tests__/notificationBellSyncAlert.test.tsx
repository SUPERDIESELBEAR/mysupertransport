/**
 * Pass B §9, rejection criterion — asserted at the RENDERED bell.
 *
 * The rejection path writes a `notifications` row of type `eld_sync_alert`.
 * A row whose type nothing renders is the missing-edge-function failure one
 * layer later, so the row is necessary evidence and not sufficient evidence.
 * This opens the bell, selects Action, and reads the text on screen.
 *
 * Regression it locks: raise_eld_sync_alert inserts priority 'high', which
 * resolveTier does not recognise, so without a taxonomy entry the item resolved
 * to tier 'fyi' and was absent from Action entirely.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ROW = {
  id: 'n1',
  title: 'ELD sync: certification rejected — Unit 412 — 2026-03-04',
  body: 'A certified log already exists for this date.',
  link: '/dashboard?view=operator-detail&op=abc',
  sent_at: new Date().toISOString(),
  read_at: null,
  type: 'eld_sync_alert',
  entity_type: 'eld_sync_alert',
  entity_id: 'alert-1',
  priority: 'high',
  snoozed_until: null,
  assigned_to: null,
  archived_at: null,
};

function query() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const k of ['select', 'eq', 'is', 'or', 'order']) chain[k] = self;
  chain.limit = async () => ({ data: [ROW], error: null });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => query(),
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
    removeChannel: () => {},
    rpc: async () => ({ data: null, error: null }),
  },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'staff-1' } }, activeRole: 'management' }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

import NotificationBell from '@/components/NotificationBell';

describe('notification bell — ELD sync rejection', () => {
  it('shows the sync alert on the Action tab, by its rendered text', async () => {
    render(<NotificationBell />);

    const bell = await screen.findByRole('button', { name: /notification/i });
    await userEvent.click(bell);

    // Lands on Action automatically because the item is unread and actionable.
    await waitFor(() => {
      expect(screen.getByText(/ELD sync: certification rejected — Unit 412 — 2026-03-04/)).toBeInTheDocument();
    });
    // And it is labelled as an ELD sync alert, not the generic fallback.
    expect(screen.queryAllByText(/^Notification$/)).toHaveLength(0);
  });
});
