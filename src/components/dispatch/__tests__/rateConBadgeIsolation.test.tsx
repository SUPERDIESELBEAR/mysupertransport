/**
 * A rate confirmation landing must not disturb anyone mid-task.
 *
 * The inbox badge owns its own realtime subscription (RateConInboxBadge), so a
 * queue insert updates that one span. This test mounts the badge next to an
 * unrelated form holding unsaved input, fires the realtime callback the badge
 * subscribed with, and asserts: the badge count updates, the typed value
 * survives, and the sibling does not re-render at all.
 *
 * Regression it locks: hoisting the count into the portal (or invalidating a
 * shared query key on queue events) re-renders every mounted view beneath it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useRef, useState } from 'react';

let openCount = 4;
let fire: (() => void) | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ count: openCount, error: null }),
      }),
    }),
    channel: () => ({
      on: function (_e: unknown, _f: unknown, cb: () => void) { fire = cb; return this; },
      subscribe: function () { return this; },
    }),
    removeChannel: () => {},
  },
}));

import RateConInboxBadge from '../RateConInboxBadge';

function UnrelatedForm() {
  const [value, setValue] = useState('');
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div>
      <input aria-label="Broker reference" value={value} onChange={e => setValue(e.target.value)} />
      <span data-testid="renders">{renders.current}</span>
    </div>
  );
}

describe('rate con queue events are scoped to the badge', () => {
  it('a queue insert updates the count without touching unsaved sibling state', async () => {
    render(
      <>
        <RateConInboxBadge />
        <UnrelatedForm />
      </>
    );

    // Initial count settles.
    expect(await screen.findByTestId('rate-con-inbox-badge')).toHaveTextContent('4');

    // Dispatcher types into the unrelated form.
    const input = screen.getByLabelText('Broker reference') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ST-9001' } });
    const rendersAfterTyping = screen.getByTestId('renders').textContent;

    // A rate confirmation lands: the subscription callback fires.
    openCount = 5;
    expect(fire).toBeTruthy();
    await act(async () => { fire!(); });

    expect(screen.getByTestId('rate-con-inbox-badge')).toHaveTextContent('5');
    // Unsaved input preserved, and the sibling never re-rendered.
    expect((screen.getByLabelText('Broker reference') as HTMLInputElement).value).toBe('ST-9001');
    expect(screen.getByTestId('renders').textContent).toBe(rendersAfterTyping);
  });
});
