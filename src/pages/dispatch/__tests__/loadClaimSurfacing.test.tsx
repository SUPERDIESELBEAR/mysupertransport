/**
 * Module 5 Pass 1 — active claims surfaced outside Load Detail.
 *
 * A HOLD blocks settlement, so the indicator must appear on the Loads list and
 * on the Dispatch Board, must never be hideable, and must not disturb the board
 * chain corrected in Module 3 Pass 3a (a ready_to_invoice load must not outrank
 * in-transit work).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableBody } from '@/components/ui/table';
import { LOAD_COLUMNS, type LoadRow } from '@/pages/dispatch/loadsColumns';
import { DriverRow } from '@/pages/dispatch/DispatchBoardPage';
import {
  summarizeActiveClaims,
  matchesClaimFilter,
  normalizeClaimFilter,
  type ActiveClaimSummary,
} from '@/lib/loadClaims';
import {
  assembleBoard,
  type BoardDriverInput,
  type BoardLoadInput,
  type DriverChain,
} from '@/lib/dispatchBoard';

/* ------------------------------------------------------------------ list -- */

const statusColumn = LOAD_COLUMNS.find(c => c.key === 'status')!;

const row = (activeClaim: ActiveClaimSummary | null): LoadRow =>
  ({
    id: 'l1',
    load_number: 'ST-TEST-005',
    status: 'in_transit',
    activeClaim,
  }) as unknown as LoadRow;

const renderStatusCell = (activeClaim: ActiveClaimSummary | null) =>
  render(<>{statusColumn.render(row(activeClaim))}</>);

/** claim_flags rows as they come back from the query. */
const claim = (flag_level: string, claim_type = 'damaged_goods') => ({ flag_level, claim_type });

/* ----------------------------------------------------------------- board -- */

const driver = (over: Partial<BoardDriverInput> = {}): BoardDriverInput => ({
  operator_id: 'd1',
  name: 'Pratt',
  unit_number: '212',
  dispatch_status: 'dispatched',
  dispatchable: true,
  ...over,
});

const boardLoad = (over: Partial<BoardLoadInput> & { id: string }): BoardLoadInput => ({
  load_number: `L-${over.id}`,
  status: 'in_transit',
  load_type: 'standard',
  operator_id: 'd1',
  created_at: '2026-01-01T00:00:00Z',
  stops: [],
  ...over,
});

const delivery = (at: string) => ({
  stop_sequence: 1, stop_type: 'delivery', city: 'Dallas', state: 'TX', appointment_start: at,
});

const renderDriverRow = (
  chainRow: DriverChain,
  activeClaimsByLoad: Record<string, ActiveClaimSummary>,
) =>
  render(
    <Table>
      <TableBody>
        <DriverRow row={chainRow} onOpen={() => {}} activeClaimsByLoad={activeClaimsByLoad} />
      </TableBody>
    </Table>,
  );

const holdSummary = summarizeActiveClaims([claim('hold')])!;
const watchSummary = summarizeActiveClaims([claim('watch', 'late_delivery')])!;

/* ------------------------------------------------------------------------- */

describe('claim indicator — Loads list', () => {
  it('renders a HOLD indicator beside the status badge', () => {
    renderStatusCell(holdSummary);
    const el = screen.getByLabelText(/hold/i);
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-destructive');
  });

  it('renders the quieter WATCH variant', () => {
    renderStatusCell(watchSummary);
    const el = screen.getByLabelText(/watch/i);
    expect(el).toBeInTheDocument();
    expect(el.className).not.toContain('text-destructive');
    expect(el.getAttribute('title')).toMatch(/late delivery/i);
  });

  it('renders nothing when the only claim is resolved or inactive', () => {
    // Inactive rows never reach the summariser; a cleared list collapses to null.
    expect(summarizeActiveClaims([])).toBeNull();
    renderStatusCell(null);
    expect(screen.queryByLabelText(/hold|watch/i)).toBeNull();
  });

  it('is locked: the claim indicator lives in a column the user cannot hide', () => {
    expect(statusColumn.locked).toBe(true);
  });
});

describe('claim indicator — Dispatch Board', () => {
  const chainRow = () =>
    assembleBoard({
      drivers: [driver()],
      loads: [boardLoad({ id: 'l1', stops: [delivery('2026-03-01T12:00:00Z')] })],
      documentsByLoad: {},
      exceptionsByLoad: {},
    }).rows[0];

  it('renders a HOLD indicator on the driver chain row', () => {
    renderDriverRow(chainRow(), { l1: holdSummary });
    const el = screen.getByLabelText(/hold/i);
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-destructive');
  });

  it('renders the quieter WATCH variant on the chain row', () => {
    renderDriverRow(chainRow(), { l1: watchSummary });
    const el = screen.getByLabelText(/watch/i);
    expect(el.className).not.toContain('text-destructive');
  });

  it('renders nothing on a chain row with no active claim', () => {
    renderDriverRow(chainRow(), {});
    expect(screen.queryByLabelText(/hold|watch/i)).toBeNull();
  });
});

describe('several active claims collapse to one indicator at the highest severity', () => {
  it('one element, hold styling, both types named', () => {
    const summary = summarizeActiveClaims([
      claim('watch', 'late_delivery'),
      claim('hold', 'damaged_goods'),
    ])!;
    expect(summary.level).toBe('hold');

    renderStatusCell(summary);
    const found = screen.getAllByLabelText(/hold|watch/i);
    expect(found).toHaveLength(1);
    expect(found[0].className).toContain('bg-destructive');
    expect(found[0].getAttribute('title')).toContain('2 claim types');
  });
});

describe('claim filter', () => {
  const rows = [
    { id: 'none', activeClaim: null },
    { id: 'watch', activeClaim: watchSummary },
    { id: 'hold', activeClaim: holdSummary },
  ];
  const ids = (f: 'all' | 'active' | 'watch' | 'hold') =>
    rows.filter(r => matchesClaimFilter(r.activeClaim, f)).map(r => r.id);

  it('returns the right rows for each value', () => {
    expect(ids('all')).toEqual(['none', 'watch', 'hold']);
    expect(ids('active')).toEqual(['watch', 'hold']);
    expect(ids('watch')).toEqual(['watch']);
    expect(ids('hold')).toEqual(['hold']);
  });

  it('persists per user through the stored view preferences record', () => {
    // The page reads its value out of `filters.claim` and writes it back, so a
    // stored preference restores and a junk/absent value degrades to 'all'.
    expect(normalizeClaimFilter(({ claim: 'hold' } as Record<string, unknown>).claim)).toBe('hold');
    expect(normalizeClaimFilter(undefined)).toBe('all');
    expect(normalizeClaimFilter('nonsense')).toBe('all');
    expect(normalizeClaimFilter(null)).toBe('all');
  });
});

describe('board chain membership, ordering and the paperwork tail are unchanged by claims', () => {
  // Module 3 Pass 3a: a ready_to_invoice load must not outrank in-transit work.
  const loads: BoardLoadInput[] = [
    boardLoad({ id: 'inv', status: 'ready_to_invoice', stops: [delivery('2026-03-01T12:00:00Z')] }),
    boardLoad({ id: 't1', status: 'in_transit', stops: [delivery('2026-03-05T12:00:00Z')] }),
    boardLoad({ id: 't2', status: 'in_transit', stops: [delivery('2026-03-09T12:00:00Z')] }),
  ];
  const board = assembleBoard({
    drivers: [driver()],
    loads,
    documentsByLoad: {},
    exceptionsByLoad: {},
  });
  const r = board.rows[0];

  it('keeps the corrected ordering: in-transit is current, ready_to_invoice stays in the tail', () => {
    expect(r.current?.id).toBe('t1');
    expect(r.queued.map(l => l.id)).toEqual(['t2']);
    expect(r.paperworkTail.map(l => l.id)).toEqual(['inv']);
    expect(r.chain.map(l => l.id)).toEqual(['inv', 't1', 't2']);
    expect(r.state).toBe('driving');
  });

  it('rendering with claims on every load changes nothing about the row structure', () => {
    const withoutClaims = renderDriverRow(r, {});
    const plain = withoutClaims.container.textContent;
    withoutClaims.unmount();

    const withClaims = renderDriverRow(r, {
      inv: holdSummary,
      t1: watchSummary,
      t2: holdSummary,
    });
    // Same loads, same order, same paperwork tail heading.
    expect(withClaims.container.textContent).toBe(plain);
    expect(screen.getByText(/awaiting paperwork/i)).toBeInTheDocument();
    const order = Array.from(withClaims.container.querySelectorAll('button'))
      .map(b => b.textContent ?? '')
      .filter(t => t.includes('L-'));
    expect(order[0]).toContain('L-t1');
    expect(order[1]).toContain('L-t2');
    expect(order[2]).toContain('L-inv');
    expect(screen.getAllByLabelText(/hold|watch/i)).toHaveLength(3);
  });
});
