import { supabase } from '@/integrations/supabase/client';
import { isoToNaive, naiveToIso } from '@/lib/carrierTimezone';
import type { Database } from '@/integrations/supabase/types';

/**
 * THE DELIVERY INSTANT.
 *
 * The settlement engine attributes a load to a work week by its delivery
 * instant, read in carrier time. That instant has ONE primary writer: the
 * driver's departure from the LAST delivery stop, derived by the database
 * trigger `derive_load_delivered_at`. Dispatch may enter it by hand when no
 * departure was recorded — `set_load_delivered_at` — and the database stamps
 * which of the two it was, plus who did it. Neither source nor actor is ever
 * sent from here: the client cannot be trusted to describe its own provenance.
 *
 * Status and the instant remain independent facts. A load can be moved to
 * 'delivered' with no instant; that is not blocked, it is SURFACED, because a
 * load past delivery with no delivery instant cannot be settled.
 */

export type LoadStatus = Database['public']['Enums']['load_status'];
export type DeliveredAtSource = Database['public']['Enums']['delivered_at_source'];

/** Statuses at 'delivered' or beyond on the normal progression. */
export const STATUSES_PAST_DELIVERY: readonly LoadStatus[] = [
  'delivered',
  'pod_received',
  'accessorials_approved',
  'ready_to_invoice',
  'invoiced',
  'factored',
  'paid',
  'settled',
  'closed',
];

export const MISSING_DELIVERY_INSTANT_LABEL = 'No delivery instant';

export const MISSING_DELIVERY_INSTANT_EXPLANATION =
  'This load is past delivery with no delivery instant recorded, so it cannot be '
  + 'attributed to a settlement week. Record the departure on its final delivery '
  + 'stop, or enter the delivery time by hand.';

interface StopLike {
  stop_type?: string | null;
  stop_sequence?: number | null;
  actual_departure_at?: string | null;
}

/**
 * The instant the database derives: departure from the LAST delivery stop.
 * Mirrors `derive_load_delivered_at` so the UI can show what a save will do.
 */
export function deriveDeliveredAt(stops: StopLike[]): string | null {
  const deliveries = stops
    .filter(s => s.stop_type === 'delivery')
    .slice()
    .sort((a, b) => Number(a.stop_sequence ?? 0) - Number(b.stop_sequence ?? 0));
  const last = deliveries[deliveries.length - 1];
  return last?.actual_departure_at ?? null;
}

/** True when a load has reached delivery but carries no delivery instant. */
export function isDeliveryInstantMissing(load: {
  status?: LoadStatus | string | null;
  delivered_at?: string | null;
}): boolean {
  if (load.delivered_at) return false;
  const status = load.status as LoadStatus | null | undefined;
  return !!status && STATUSES_PAST_DELIVERY.includes(status);
}

/** `2026-08-27T13:04:00Z` -> `2026-08-27T08:04`, carrier wall clock. */
export function toDeliveredAtInput(iso: string | null | undefined): string {
  return isoToNaive(iso);
}

/** `2026-08-27T08:04` (carrier wall clock) -> ISO instant, or null when empty. */
export function fromDeliveredAtInput(value: string): string | null {
  if (!value.trim()) return null;
  try {
    return naiveToIso(value.trim());
  } catch {
    return null;
  }
}

/** Dispatcher entry. Source and actor are stamped by the database. */
export async function saveDeliveredAt(
  loadId: string,
  deliveredAtIso: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_load_delivered_at', {
    p_load_id: loadId,
    p_delivered_at: deliveredAtIso,
  });
  if (error) throw error;
}

export function describeDeliveredAtSource(
  source: DeliveredAtSource | null | undefined,
  actorName?: string | null,
): string | null {
  if (source === 'stop_departure') return 'Derived from departure on the final delivery stop';
  if (source === 'dispatcher_entry') return `Entered by ${actorName || 'dispatch'}`;
  return null;
}
