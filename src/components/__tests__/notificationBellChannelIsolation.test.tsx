/**
 * Two notification bells must be able to live at once.
 *
 * Staff-side Operator Preview mounts OperatorPortal inside StaffPortal, so two
 * bells subscribe simultaneously. With a fixed channel name supabase-js hands
 * back the SAME channel object for the second mount, and adding a
 * postgres_changes listener to an already-subscribed channel throws — which
 * white-screened the whole app. Same defect, same fix as RateConInboxBadge.
 *
 * The mock below reproduces exactly that behaviour: channels are cached by
 * name, and `.on()` after `.subscribe()` throws.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const channelNames: string[] = [];
const channels = new Map<string, any>();

function makeChannel(name: string) {
  if (channels.has(name)) return channels.get(name);
  const ch = {
    name,
    subscribed: false,
    on(_e: unknown, _f: unknown, _cb: () => void) {
      if (this.subscribed) {
        throw new Error('tried to subscribe multiple times. \'subscribe\' can only be called a single time per channel instance');
      }
      return this;
    },
    subscribe() { this.subscribed = true; return this; },
  };
  channels.set(name, ch);
  return ch;
}

const emptyQuery: any = {
  select: () => emptyQuery,
  eq: () => emptyQuery,
  is: () => emptyQuery,
  or: () => emptyQuery,
  order: () => emptyQuery,
  limit: async () => ({ data: [], error: null }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => emptyQuery,
    rpc: async () => ({ data: null, error: null }),
    channel: (name: string) => { channelNames.push(name); return makeChannel(name); },
    removeChannel: () => {},
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, roles: [] }),
}));

import NotificationBell from '../NotificationBell';

describe('NotificationBell realtime channel', () => {
  beforeEach(() => { channelNames.length = 0; channels.clear(); });

  it('two concurrent mounts do not collide on one channel', () => {
    expect(() => render(
      <MemoryRouter>
        <NotificationBell />
        <NotificationBell />
      </MemoryRouter>,
    )).not.toThrow();

    expect(channelNames).toHaveLength(2);
    expect(new Set(channelNames).size).toBe(2);
    expect(channelNames.every(n => n.startsWith('notifications-bell-'))).toBe(true);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2);
  });
});
