import { supabase } from '@/integrations/supabase/client';

/**
 * Load-linked messaging plumbing.
 *
 * A load-linked message is an ordinary direct message that carries `load_id`.
 * It still lives in the two participants' single conversation — the link is a
 * label, not a separate thread — so nothing about threading changes.
 */

export interface LoadChatContext {
  id: string;
  load_number: string;
  status: string;
  origin: string | null;
  destination: string | null;
  pickup_at: string | null;
  delivery_at: string | null;
}

export interface OpenLoadChatRequest {
  /** auth user id of the driver to message. */
  driverUserId: string;
  loadId: string;
  loadNumber?: string;
}

const OPEN_LOAD_CHAT_EVENT = 'superdrive:open-load-chat';

/** Ask the floating chat window to open on this driver with the load linked. */
export function openLoadChat(req: OpenLoadChatRequest) {
  window.dispatchEvent(new CustomEvent<OpenLoadChatRequest>(OPEN_LOAD_CHAT_EVENT, { detail: req }));
}

/** Subscribe to open-load-chat requests. Returns an unsubscribe function. */
export function onOpenLoadChat(handler: (req: OpenLoadChatRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenLoadChatRequest>).detail);
  window.addEventListener(OPEN_LOAD_CHAT_EVENT, listener);
  return () => window.removeEventListener(OPEN_LOAD_CHAT_EVENT, listener);
}

const stopLabel = (r: { city: string | null; state: string | null } | undefined): string | null =>
  r ? [r.city, r.state].filter(Boolean).join(', ') || null : null;

/** Load header + first pickup / last delivery, for the in-thread context strip. */
export async function fetchLoadChatContext(loadId: string): Promise<LoadChatContext | null> {
  const { data, error } = await supabase
    .from('loads')
    .select('id, load_number, status, load_stops(stop_sequence, stop_type, city, state, appointment_start)')
    .eq('id', loadId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    load_number: string;
    status: string;
    load_stops:
      | {
          stop_sequence: number | null;
          stop_type: string | null;
          city: string | null;
          state: string | null;
          appointment_start: string | null;
        }[]
      | null;
  };

  const stops = (row.load_stops ?? []).slice().sort(
    (a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0),
  );
  const pickup = stops.find(s => s.stop_type === 'pickup') ?? stops[0];
  const delivery = [...stops].reverse().find(s => s.stop_type === 'delivery') ?? stops[stops.length - 1];

  return {
    id: row.id,
    load_number: row.load_number,
    status: row.status,
    origin: stopLabel(pickup),
    destination: stopLabel(delivery),
    pickup_at: pickup?.appointment_start ?? null,
    delivery_at: delivery?.appointment_start ?? null,
  };
}

/** Map of load id → load number, for chips on messages linked to other loads. */
export async function fetchLoadNumbers(loadIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(loadIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from('loads').select('id, load_number').in('id', ids);
  return new Map((data ?? []).map(r => [r.id as string, r.load_number as string]));
}
