/**
 * ABSENCE IS INFORMATION.
 *
 * A missing or incomplete driver pay estimate must never be rendered as a
 * dollar amount — $0.00 included. A driver reads $0.00 as "this load pays me
 * nothing", which is a fabricated claim when the charges simply have not been
 * entered yet. Same rule as "Not stated" on detention terms.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperatorTodayCard } from '@/components/operator/OperatorTodayCard';
import type { HomeLoad } from '@/hooks/useOperatorHome';

const load = {
  id: 'l1', load_number: 'ST-TEST-001', status: 'in_transit',
  loadType: 'standard', brokerName: 'Test Broker',
  originCity: 'Kansas City', originState: 'MO',
  destinationCity: 'Dallas', destinationState: 'TX',
  stops: [], next: null, outstandingPaperwork: [],
} as unknown as HomeLoad;

const DOLLARS = /\$\s?-?[\d,]+(\.\d{2})?/;

describe('OperatorTodayCard pay estimate', () => {
  it('renders no dollar figure when the estimate is absent', () => {
    const { container } = render(
      <OperatorTodayCard load={load} pay={{ amount: null, incomplete: true }} queuedCount={0} />
    );
    expect(container.textContent ?? '').not.toMatch(DOLLARS);
    expect(screen.getByText(/not yet calculated/i)).toBeTruthy();
  });

  it('renders no dollar figure when the estimate is incomplete, even at zero', () => {
    const { container } = render(
      <OperatorTodayCard load={load} pay={{ amount: 0, incomplete: true }} queuedCount={0} />
    );
    expect(container.textContent ?? '').not.toMatch(DOLLARS);
    expect(container.textContent ?? '').not.toContain('$0.00');
    expect(screen.getByText(/not yet calculated/i)).toBeTruthy();
  });

  it('renders no dollar figure when there is no estimate row at all', () => {
    const { container } = render(
      <OperatorTodayCard load={load} pay={null} queuedCount={0} />
    );
    expect(container.textContent ?? '').not.toMatch(DOLLARS);
  });

  it('renders the figure only when the estimate is complete', () => {
    const { container } = render(
      <OperatorTodayCard load={load} pay={{ amount: 1440.5, incomplete: false }} queuedCount={0} />
    );
    expect(container.textContent ?? '').toContain('1,440.50');
    expect(screen.queryByText(/not yet calculated/i)).toBeNull();
  });
});
