import { describe, expect, it } from 'vitest';
import { assembleBoard, resolveDeliveryTime, type BoardDriverInput, type BoardLoadInput } from '@/lib/dispatchBoard';

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
    expect(r.rows[0].state).toBe('has_chain');
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
