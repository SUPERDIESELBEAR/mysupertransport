import { describe, it, expect } from 'vitest';
import {
  boardAttentionFlags, countAttentionFlags, filterBoardRows, matchesBoardSearch,
} from '@/lib/dispatchBoardFilters';
import type { ChainLoad, DriverChain } from '@/lib/dispatchBoard';
import type { ActiveClaimSummary } from '@/lib/loadClaims';

function load(over: Partial<ChainLoad> = {}): ChainLoad {
  return {
    id: over.id ?? 'l1',
    load_number: over.load_number ?? 'ST-1042',
    status: over.status ?? 'in_transit',
    originCity: over.originCity ?? 'Kansas City',
    originState: over.originState ?? 'MO',
    destinationCity: over.destinationCity ?? 'Joliet',
    destinationState: over.destinationState ?? 'IL',
    deliveryTime: over.deliveryTime ?? '2026-09-20T12:00:00Z',
    deliveryTimeSource: over.deliveryTimeSource ?? 'last_delivery_stop',
    paperworkComplete: over.paperworkComplete ?? false,
  };
}

function row(over: Partial<DriverChain> = {}): DriverChain {
  // `current: null` must stay null — a paperwork-only row has no driving load.
  const current = 'current' in over ? over.current ?? null : load();
  return {
    driver: {
      operator_id: 'op1', name: 'Steve Figueroa', unit_number: '210',
      dispatch_status: 'dispatched', dispatchable: true,
      ...(over.driver ?? {}),
    },
    dispatch_status: 'dispatched',
    chain: over.chain ?? [current],
    current,
    queued: over.queued ?? [],
    paperworkTail: over.paperworkTail ?? [],
    state: over.state ?? 'driving',
  };
}

const noClaims: Record<string, ActiveClaimSummary> = {};

describe('board search', () => {
  it('matches a load number with and without the dash', () => {
    expect(matchesBoardSearch(row(), 'ST-1042')).toBe(true);
    expect(matchesBoardSearch(row(), 'st1042')).toBe(true);
    expect(matchesBoardSearch(row(), 'ST-9999')).toBe(false);
  });

  it('matches a city on a queued load, not just the current one', () => {
    const r = row({ queued: [load({ id: 'l2', load_number: 'ST-2000', destinationCity: 'Laredo' })] });
    expect(matchesBoardSearch(r, 'laredo')).toBe(true);
  });

  it('matches driver name and unit number', () => {
    expect(matchesBoardSearch(row(), 'figue')).toBe(true);
    expect(matchesBoardSearch(row(), '210')).toBe(true);
  });

  it('an empty term matches everything', () => {
    expect(matchesBoardSearch(row(), '   ')).toBe(true);
  });
});

describe('attention flags', () => {
  const now = new Date('2026-09-15T18:00:00Z'); // 2026-09-15 in carrier time

  it('flags a driver with no chain', () => {
    const r = row({ current: null, chain: [], state: 'no_chain' });
    expect(boardAttentionFlags(r, noClaims, now).noLoad).toBe(true);
  });

  it('flags a claim from the claim map', () => {
    const claims = {
      l1: { level: 'hold', claimType: 'damaged_goods', title: 'Hold — Damaged goods' } as ActiveClaimSummary,
    };
    expect(boardAttentionFlags(row(), claims, now).claim).toBe(true);
    expect(boardAttentionFlags(row(), noClaims, now).claim).toBe(false);
  });

  it('flags awaiting paperwork', () => {
    const r = row({ paperworkTail: [load({ id: 'l3', load_number: 'ST-1000' })] });
    expect(boardAttentionFlags(r, noClaims, now).paperwork).toBe(true);
  });

  it('treats today and the past as due, tomorrow as not', () => {
    const today = row({ current: load({ deliveryTime: '2026-09-15T23:00:00Z' }) });
    const past = row({ current: load({ deliveryTime: '2026-09-10T12:00:00Z' }) });
    const future = row({ current: load({ deliveryTime: '2026-09-16T12:00:00Z' }) });
    expect(boardAttentionFlags(today, noClaims, now).dueSoon).toBe(true);
    expect(boardAttentionFlags(past, noClaims, now).dueSoon).toBe(true);
    expect(boardAttentionFlags(future, noClaims, now).dueSoon).toBe(false);
  });
});

describe('combined filtering', () => {
  const now = new Date('2026-09-15T18:00:00Z');
  const paperworkRow = row({
    driver: { operator_id: 'op2', name: 'Ali Karim', unit_number: '224', dispatch_status: 'home', dispatchable: true },
    current: null,
    queued: [],
    paperworkTail: [load({ id: 'l9', load_number: 'ST-1300' })],
    state: 'paperwork_only',
  });
  const rows = [row(), paperworkRow];

  it('search and chips are ANDed', () => {
    expect(filterBoardRows(rows, { term: 'ST-1300', flags: ['paperwork'], activeClaimsByLoad: noClaims, now }))
      .toHaveLength(1);
    expect(filterBoardRows(rows, { term: 'ST-1042', flags: ['paperwork'], activeClaimsByLoad: noClaims, now }))
      .toHaveLength(0);
  });

  it('no term and no chips returns every row unchanged', () => {
    expect(filterBoardRows(rows, { term: '', flags: [], activeClaimsByLoad: noClaims, now })).toBe(rows);
  });

  it('counts chips per row, not per load', () => {
    const counts = countAttentionFlags(rows, noClaims, now);
    expect(counts.paperwork).toBe(1);
    expect(counts.noLoad).toBe(0);
    expect(counts.claim).toBe(0);
  });
});
