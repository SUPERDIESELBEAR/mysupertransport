/**
 * Dispatch Board chain assembly. PURE — no supabase, no React.
 *
 * Takes flat rows (loads, stops, documents, exceptions, drivers) and returns
 * per-driver ordered load chains plus the faults worth surfacing.
 *
 * The paperwork rule is NOT re-implemented here. `evaluateLoadPaperwork` from
 * src/lib/loadPaperwork.ts is the single definition; this module is its second
 * reader.
 */
import { evaluateLoadPaperwork, type PaperworkDocumentInput, type PaperworkExceptionInput } from '@/lib/loadPaperwork';
import type { LoadStatus } from '@/lib/loadFormat';

/** Never on a chain. A TONU never receives a POD, so paperwork can never close it. */
export const CHAIN_EXCLUDED_STATUSES: LoadStatus[] = ['cancelled', 'tonu'];

/** On the chain regardless of paperwork. */
export const PRE_DELIVERY_STATUSES: LoadStatus[] = [
  'available', 'covered', 'dispatched', 'in_transit', 'at_delivery',
];

export type DeliveryTimeSource = 'last_delivery_stop' | 'first_stop' | 'created_at';

export interface BoardStop {
  stop_sequence: number | null;
  stop_type: string | null;
  city: string | null;
  state: string | null;
  appointment_start: string | null;
}

export interface BoardLoadInput {
  id: string;
  load_number: string;
  status: LoadStatus | string;
  load_type: string | null;
  operator_id: string | null;
  created_at: string;
  stops: BoardStop[];
}

export interface BoardDriverInput {
  operator_id: string;
  name: string;
  unit_number: string | null;
  dispatch_status: string | null;
  /** False when excluded_from_dispatch or inactive. */
  dispatchable: boolean;
  excluded_reason?: string | null;
}

export interface ChainLoad {
  id: string;
  load_number: string;
  status: LoadStatus | string;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  /** ISO string used for ordering. */
  deliveryTime: string;
  deliveryTimeSource: DeliveryTimeSource;
  paperworkComplete: boolean;
}

export type DriverChainState = 'driving' | 'paperwork_only' | 'no_chain';

export interface DriverChain {
  driver: BoardDriverInput;
  dispatch_status: string | null;
  /** Full ordered chain — membership is unchanged; presentation splits below. */
  chain: ChainLoad[];
  /** First pre-delivery load in ascending delivery order. Driving work. */
  current: ChainLoad | null;
  /** Remaining pre-delivery loads, ascending. Uncapped. */
  queued: ChainLoad[];
  /** Delivered-or-beyond loads with incomplete paperwork, oldest first. Office work. */
  paperworkTail: ChainLoad[];
  state: DriverChainState;
}

export interface BoardFaults {
  /** Chain loads still sitting at status 'available' despite having a driver. */
  availableWithDriver: { loadId: string; loadNumber: string; operatorId: string }[];
  /** Chain loads held by a driver who is not dispatchable. */
  heldByNonDispatchable: { loadId: string; loadNumber: string; operatorId: string }[];
  /** Loads past 'available' with no driver at all — they belong to no chain. */
  noDriver: { loadId: string; loadNumber: string; status: string }[];
}

export interface BoardResult {
  /** Dispatchable drivers, in input order. */
  rows: DriverChain[];
  /** Non-dispatchable drivers that nonetheless hold at least one chain load. */
  offDispatchRows: DriverChain[];
  faults: BoardFaults;
}

function sortedStops(stops: BoardStop[]): BoardStop[] {
  return stops.slice().sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
}

/** Delivery time with an explicit record of which fallback produced it. */
export function resolveDeliveryTime(load: BoardLoadInput): { time: string; source: DeliveryTimeSource } {
  const stops = sortedStops(load.stops ?? []);
  const deliveries = stops.filter(s => s.stop_type === 'delivery');
  const lastDelivery = deliveries.length ? deliveries[deliveries.length - 1] : undefined;
  if (lastDelivery?.appointment_start) {
    return { time: lastDelivery.appointment_start, source: 'last_delivery_stop' };
  }
  const first = stops[0];
  if (first?.appointment_start) return { time: first.appointment_start, source: 'first_stop' };
  return { time: load.created_at, source: 'created_at' };
}

/**
 * Chain membership. Pre-delivery statuses are always in; everything at
 * 'delivered' or beyond stays only while its paperwork is incomplete.
 */
export function isOnChain(
  load: BoardLoadInput,
  documents: PaperworkDocumentInput[],
  exceptions: PaperworkExceptionInput[],
): { onChain: boolean; paperworkComplete: boolean } {
  const status = load.status as LoadStatus;
  const paperwork = evaluateLoadPaperwork(load.load_type, documents, exceptions);
  if (CHAIN_EXCLUDED_STATUSES.includes(status)) {
    return { onChain: false, paperworkComplete: paperwork.complete };
  }
  if (PRE_DELIVERY_STATUSES.includes(status)) {
    return { onChain: true, paperworkComplete: paperwork.complete };
  }
  return { onChain: !paperwork.complete, paperworkComplete: paperwork.complete };
}

export interface AssembleInput {
  drivers: BoardDriverInput[];
  loads: BoardLoadInput[];
  /** Keyed by load id. */
  documentsByLoad: Record<string, PaperworkDocumentInput[]>;
  /** Keyed by load id. */
  exceptionsByLoad: Record<string, PaperworkExceptionInput[]>;
}

export function assembleBoard({
  drivers, loads, documentsByLoad, exceptionsByLoad,
}: AssembleInput): BoardResult {
  const driverById = new Map(drivers.map(d => [d.operator_id, d]));
  const chains = new Map<string, ChainLoad[]>();
  const faults: BoardFaults = { availableWithDriver: [], heldByNonDispatchable: [], noDriver: [] };

  loads.forEach(load => {
    const docs = documentsByLoad[load.id] ?? [];
    const excs = exceptionsByLoad[load.id] ?? [];

    if (!load.operator_id) {
      if (load.status !== 'available' && !CHAIN_EXCLUDED_STATUSES.includes(load.status as LoadStatus)) {
        faults.noDriver.push({ loadId: load.id, loadNumber: load.load_number, status: String(load.status) });
      }
      return;
    }

    const { onChain, paperworkComplete } = isOnChain(load, docs, excs);
    if (!onChain) return;

    const stops = sortedStops(load.stops ?? []);
    const first = stops[0];
    const last = stops.length > 1 ? stops[stops.length - 1] : undefined;
    const { time, source } = resolveDeliveryTime(load);

    const entry: ChainLoad = {
      id: load.id,
      load_number: load.load_number,
      status: load.status,
      originCity: first?.city ?? null,
      originState: first?.state ?? null,
      destinationCity: last?.city ?? null,
      destinationState: last?.state ?? null,
      deliveryTime: time,
      deliveryTimeSource: source,
      paperworkComplete,
    };

    if (load.status === 'available') {
      faults.availableWithDriver.push({
        loadId: load.id, loadNumber: load.load_number, operatorId: load.operator_id,
      });
    }
    const driver = driverById.get(load.operator_id);
    if (driver && !driver.dispatchable) {
      faults.heldByNonDispatchable.push({
        loadId: load.id, loadNumber: load.load_number, operatorId: load.operator_id,
      });
    }

    const list = chains.get(load.operator_id) ?? [];
    list.push(entry);
    chains.set(load.operator_id, list);
  });

  // Ascending by resolved delivery time. UNCAPPED — never sliced.
  chains.forEach(list => list.sort((a, b) => a.deliveryTime.localeCompare(b.deliveryTime)));

  const build = (driver: BoardDriverInput): DriverChain => {
    const chain = chains.get(driver.operator_id) ?? [];
    const preDelivery = chain.filter(c => PRE_DELIVERY_STATUSES.includes(c.status as LoadStatus));
    const paperworkTail = chain.filter(c => !PRE_DELIVERY_STATUSES.includes(c.status as LoadStatus));
    const [current, ...queued] = preDelivery;
    const state: DriverChainState =
      preDelivery.length > 0 ? 'driving' : paperworkTail.length > 0 ? 'paperwork_only' : 'no_chain';
    return {
      driver,
      dispatch_status: driver.dispatch_status,
      chain,
      current: current ?? null,
      queued,
      paperworkTail,
      state,
    };
  };

  const rows = drivers.filter(d => d.dispatchable).map(build);
  const offDispatchRows = drivers
    .filter(d => !d.dispatchable && (chains.get(d.operator_id)?.length ?? 0) > 0)
    .map(build);

  return { rows, offDispatchRows, faults };
}
