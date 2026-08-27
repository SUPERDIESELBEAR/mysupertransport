import { describe, expect, it } from 'vitest';
import { assembleBoard, filterRowsByDispatcher, resolveDeliveryTime, type BoardDriverInput, type BoardLoadInput } from '@/lib/dispatchBoard';

const driver = (id: string, over: Partial<BoardDriverInput> = {}): BoardDriverInput => ({
  operator_id: id,
  name: `Driver ${id}`,
  unit_number: '100',
  dispatch_status: 'dispatched',
  dispatchable: true,
  ...over,
});

const load = (over: Partial<BoardLoadInput> & { id: string }): BoardLoadInput => ({
  load_number: `L-${over.id}`,
  status: 'dispatched',
  load_type: 'standard',
  operator_id: 'd1',
  created_at: '2026-01-01T00:00:00Z',
  stops: [],
  ...over,
});

const delivery = (seq: number, at: string | null) => ({
  stop_sequence: seq, stop_type: 'delivery', city: 'Dallas', state: 'TX', appointment_start: at,
});
const pickup = (seq: number, at: string | null) => ({
  stop_sequence: seq, stop_type: 'pickup', city: 'Tulsa', state: 'OK', appointment_start: at,
});

const run = (
  loads: BoardLoadInput[],
  drivers = [driver('d1')],
  documentsByLoad: Record<string, any[]> = {},
  exceptionsByLoad: Record<string, any[]> = {},
) => assembleBoard({ drivers, loads, documentsByLoad, exceptionsByLoad });

describe('chain ordering', () => {
  it('orders by delivery appointment regardless of input order', () => {
    const r = run([
      load({ id: 'b', stops: [pickup(1, null), delivery(2, '2026-03-10T12:00:00Z')] }),
      load({ id: 'c', stops: [pickup(1, null), delivery(2, '2026-03-20T12:00:00Z')] }),
      load({ id: 'a', stops: [pickup(1, null), delivery(2, '2026-03-01T12:00:00Z')] }),
    ]);
    expect(r.rows[0].chain.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(r.rows[0].state).toBe('driving');
  });

  it('is not capped', () => {
    const loads = ['1', '2', '3', '4', '5'].map(n =>
      load({ id: n, stops: [delivery(1, `2026-04-0${n}T12:00:00Z`)] }));
    expect(run(loads).rows[0].chain).toHaveLength(5);
  });
});

describe('delivery time resolution sources', () => {
  it('uses the last delivery stop', () => {
    const l = load({ id: 'x', stops: [delivery(2, '2026-05-02T00:00:00Z'), delivery(1, '2026-05-01T00:00:00Z')] });
    expect(resolveDeliveryTime(l)).toEqual({ time: '2026-05-02T00:00:00Z', source: 'last_delivery_stop' });
    expect(run([l]).rows[0].chain[0].deliveryTimeSource).toBe('last_delivery_stop');
  });

  it('falls back to the first stop', () => {
    const l = load({ id: 'x', stops: [pickup(1, '2026-05-05T00:00:00Z'), delivery(2, null)] });
    expect(resolveDeliveryTime(l)).toEqual({ time: '2026-05-05T00:00:00Z', source: 'first_stop' });
    expect(run([l]).rows[0].chain[0].deliveryTimeSource).toBe('first_stop');
  });

  it('falls back to created_at', () => {
    const l = load({ id: 'x', stops: [], created_at: '2026-06-06T00:00:00Z' });
    expect(resolveDeliveryTime(l)).toEqual({ time: '2026-06-06T00:00:00Z', source: 'created_at' });
    expect(run([l]).rows[0].chain[0].deliveryTimeSource).toBe('created_at');
  });
});

describe('paperwork governs post-delivery membership', () => {
  it('keeps a delivered load with incomplete paperwork', () => {
    const r = run([load({ id: 'x', status: 'delivered' })]);
    expect(r.rows[0].chain.map(c => c.id)).toEqual(['x']);
  });

  it('keeps an invoiced load with a missing POD', () => {
    const r = run([load({ id: 'x', status: 'invoiced' })]);
    expect(r.rows[0].chain).toHaveLength(1);
  });

  it('drops a delivered load with complete paperwork', () => {
    const r = run([load({ id: 'x', status: 'delivered' })], [driver('d1')], {
      x: [{ document_type: 'pod' }],
    });
    expect(r.rows[0].chain).toHaveLength(0);
    expect(r.rows[0].state).toBe('no_chain');
  });
});

describe('status exclusions', () => {
  it('excludes tonu even though its paperwork can never complete', () => {
    expect(run([load({ id: 'x', status: 'tonu' })]).rows[0].chain).toHaveLength(0);
  });

  it('excludes cancelled', () => {
    expect(run([load({ id: 'x', status: 'cancelled' })]).rows[0].chain).toHaveLength(0);
  });
});

describe('faults', () => {
  it("includes an 'available' load with a driver and reports it", () => {
    const r = run([load({ id: 'x', status: 'available' })]);
    expect(r.rows[0].chain.map(c => c.id)).toEqual(['x']);
    expect(r.faults.availableWithDriver).toEqual([
      { loadId: 'x', loadNumber: 'L-x', operatorId: 'd1' },
    ]);
  });

  it('reports loads past Available with no driver', () => {
    const r = run([load({ id: 'x', status: 'covered', operator_id: null })]);
    expect(r.faults.noDriver.map(f => f.loadId)).toEqual(['x']);
  });

  it('reports a load held by an excluded driver separately rather than dropping it', () => {
    const r = run(
      [load({ id: 'x', operator_id: 'd2' })],
      [driver('d1'), driver('d2', { dispatchable: false, excluded_reason: 'Suspended' })],
    );
    expect(r.rows.map(x => x.driver.operator_id)).toEqual(['d1']);
    expect(r.offDispatchRows).toHaveLength(1);
    expect(r.offDispatchRows[0].chain.map(c => c.id)).toEqual(['x']);
    expect(r.faults.heldByNonDispatchable.map(f => f.loadId)).toEqual(['x']);
  });
});

describe('empty chains', () => {
  it('returns no_chain for a driver with no loads', () => {
    const r = run([], [driver('d1')]);
    expect(r.rows[0].state).toBe('no_chain');
    expect(r.rows[0].chain).toEqual([]);
  });
});


describe('driving work vs office work', () => {
  // Regression: Johnathan Pratt's row. A Ready To Invoice load with an earlier
  // delivery date sorted ABOVE the loads under his wheels.
  it('keeps an in-transit load as current even when a delivered-incomplete load is older', () => {
    const r = run(
      [
        load({ id: 'inv', status: 'ready_to_invoice', stops: [delivery(1, '2026-03-01T12:00:00Z')] }),
        load({ id: 'run1', status: 'in_transit', stops: [delivery(1, '2026-03-10T12:00:00Z')] }),
        load({ id: 'run2', status: 'in_transit', stops: [delivery(1, '2026-03-15T12:00:00Z')] }),
      ],
      [driver('d1')],
      {},
    );
    const row = r.rows[0];
    expect(row.current?.id).toBe('run1');
    expect(row.queued.map(l => l.id)).toEqual(['run2']);
    expect(row.paperworkTail.map(l => l.id)).toEqual(['inv']);
    expect(row.state).toBe('driving');
  });

  it('reports paperwork_only when there is no pre-delivery load', () => {
    const r = run([load({ id: 'p', status: 'delivered', stops: [delivery(1, '2026-02-01T12:00:00Z')] })]);
    expect(r.rows[0].state).toBe('paperwork_only');
    expect(r.rows[0].current).toBeNull();
    expect(r.rows[0].paperworkTail.map(l => l.id)).toEqual(['p']);
  });

  it('leaves an empty tail when every load is pre-delivery', () => {
    const r = run([
      load({ id: 'a', status: 'dispatched', stops: [delivery(1, '2026-02-01T12:00:00Z')] }),
      load({ id: 'b', status: 'in_transit', stops: [delivery(1, '2026-02-05T12:00:00Z')] }),
    ]);
    expect(r.rows[0].paperworkTail).toEqual([]);
    expect(r.rows[0].current?.id).toBe('a');
  });

  it('orders the paperwork tail oldest first', () => {
    const r = run([
      load({ id: 'new', status: 'delivered', stops: [delivery(1, '2026-02-20T12:00:00Z')] }),
      load({ id: 'old', status: 'ready_to_invoice', stops: [delivery(1, '2026-01-05T12:00:00Z')] }),
    ]);
    expect(r.rows[0].paperworkTail.map(l => l.id)).toEqual(['old', 'new']);
  });

  it('does not cap the queue', () => {
    const r = run(['1', '2', '3', '4'].map(n =>
      load({ id: n, status: 'dispatched', stops: [delivery(1, `2026-06-0${n}T12:00:00Z`)] })));
    expect(r.rows[0].current?.id).toBe('1');
    expect(r.rows[0].queued.map(l => l.id)).toEqual(['2', '3', '4']);
  });
});

describe('dispatcher scoping', () => {
  const rowsFor = () => run(
    [
      load({ id: 'a', operator_id: 'd1', stops: [delivery(1, '2026-07-01T12:00:00Z')] }),
      load({ id: 'b', operator_id: 'd2', stops: [delivery(1, '2026-07-02T12:00:00Z')] }),
    ],
    [
      driver('d1', { assigned_dispatcher: 'u-me' }),
      driver('d2', { assigned_dispatcher: 'u-other' }),
      driver('d3', { assigned_dispatcher: null }),
    ],
  ).rows;

  it("'all' returns every row unchanged", () => {
    const rows = rowsFor();
    expect(filterRowsByDispatcher(rows, 'all', 'u-me')).toEqual(rows);
  });

  it("'me' returns only rows assigned to the current user", () => {
    expect(filterRowsByDispatcher(rowsFor(), 'me', 'u-me').map(r => r.driver.operator_id))
      .toEqual(['d1']);
  });

  it('a specific dispatcher id returns only that dispatcher rows', () => {
    expect(filterRowsByDispatcher(rowsFor(), 'u-other', 'u-me').map(r => r.driver.operator_id))
      .toEqual(['d2']);
  });

  it('a null assignment is excluded by me and by a specific id, included by all', () => {
    const rows = rowsFor();
    expect(filterRowsByDispatcher(rows, 'me', 'u-me').some(r => r.driver.operator_id === 'd3')).toBe(false);
    expect(filterRowsByDispatcher(rows, 'u-other', 'u-me').some(r => r.driver.operator_id === 'd3')).toBe(false);
    expect(filterRowsByDispatcher(rows, 'all', 'u-me').some(r => r.driver.operator_id === 'd3')).toBe(true);
  });

  it('does not reorder rows or alter chain contents', () => {
    const rows = run(
      [
        load({ id: 'a', operator_id: 'd1', stops: [delivery(1, '2026-07-01T12:00:00Z')] }),
        load({ id: 'a2', operator_id: 'd1', stops: [delivery(1, '2026-07-05T12:00:00Z')] }),
        load({ id: 'p', operator_id: 'd1', status: 'delivered', stops: [delivery(1, '2026-06-01T12:00:00Z')] }),
        load({ id: 'z', operator_id: 'd0', stops: [delivery(1, '2026-07-01T12:00:00Z')] }),
      ],
      [
        driver('d0', { assigned_dispatcher: 'u-me' }),
        driver('d1', { assigned_dispatcher: 'u-me' }),
      ],
    ).rows;
    const filtered = filterRowsByDispatcher(rows, 'me', 'u-me');
    expect(filtered.map(r => r.driver.operator_id)).toEqual(['d0', 'd1']);
    const d1 = filtered[1];
    expect(d1.current?.id).toBe('a');
    expect(d1.queued.map(l => l.id)).toEqual(['a2']);
    expect(d1.paperworkTail.map(l => l.id)).toEqual(['p']);
    expect(d1).toBe(rows[1]);
  });
});

describe('delivery ordering across mixed offset representations', () => {
  it('sorts chronologically when timestamps serialise differently', () => {
    const r = run([
      load({ id: 'a', stops: [delivery(1, '2026-03-10T18:00:00+00:00')] }), // 18:00Z
      load({ id: 'b', stops: [delivery(1, '2026-03-10T09:00:00-05:00')] }), // 14:00Z
      load({ id: 'c', stops: [delivery(1, '2026-03-10T16:00:00Z')] }),      // 16:00Z
    ]);
    expect(r.rows[0].chain.map(c => c.id)).toEqual(['b', 'c', 'a']);
  });
});
