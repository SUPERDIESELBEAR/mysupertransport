import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type LoadsRow = Database['public']['Tables']['loads']['Row'];
type StopRow = Database['public']['Tables']['load_stops']['Row'];

export interface LoadDetailBroker {
  id: string;
  company_name: string;
  mc_number: string | null;
}

export interface LoadDetail extends LoadsRow {
  broker: LoadDetailBroker | null;
  stops: StopRow[];
  driver_name: string | null;
  dispatcher_name: string | null;
  created_by_name: string | null;
}

export interface LoadClaimFlag {
  id: string;
  flag_level: Database['public']['Enums']['claim_flag_level'];
  claim_type: Database['public']['Enums']['claim_type'];
  description: string | null;
  reported_at: string | null;
}

const nameOf = (p?: { first_name: string | null; last_name: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null;

/** Load + broker + stops + resolved people names. Names need a second read because
 *  operator_id/created_by do not have PostgREST-traversable FKs into profiles. */
export async function fetchLoadDetail(id: string): Promise<LoadDetail | null> {
  const { data, error } = await supabase
    .from('loads')
    .select(
      '*, broker:broker_id(id, company_name, mc_number), ' +
      'dispatcher:dispatcher_id(first_name, last_name), ' +
      'creator:created_by(first_name, last_name), ' +
      'load_stops(*)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;

  let driverName: string | null = null;
  const operatorId = row.operator_id as string | null;
  if (operatorId) {
    const { data: op } = await supabase
      .from('operators')
      .select('user_id')
      .eq('id', operatorId)
      .maybeSingle();
    if (op?.user_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', op.user_id)
        .maybeSingle();
      driverName = nameOf(prof);
    }
  }

  const stops = (((row.load_stops as StopRow[] | null) ?? []) as StopRow[])
    .slice()
    .sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));

  return {
    ...(row as unknown as LoadsRow),
    broker: (row.broker as LoadDetailBroker | null) ?? null,
    stops,
    driver_name: driverName,
    dispatcher_name: nameOf(row.dispatcher as never),
    created_by_name: nameOf(row.creator as never),
  };
}

/** Active claim flags for a load. Only called for staff roles. */
export async function fetchLoadClaimFlags(loadId: string): Promise<LoadClaimFlag[]> {
  const { data, error } = await supabase
    .from('claim_flags')
    .select('id, flag_level, claim_type, description, reported_at')
    .eq('load_id', loadId)
    .eq('is_active', true)
    .order('reported_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoadClaimFlag[];
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
});

/** "Aug 19, 2026, 1:05 PM" — em dash when empty/invalid. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateTime.format(d);
}

/** Appointment window collapsed to one line; same-day windows omit the repeated date. */
export function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return 'No appointment set';
  if (start && !end) return formatDateTime(start);
  if (!start && end) return `Until ${formatDateTime(end)}`;
  const s = new Date(start as string);
  const e = new Date(end as string);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';
  const sameDay = s.toDateString() === e.toDateString();
  const endPart = sameDay
    ? e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : formatDateTime(end);
  return `${formatDateTime(start)} – ${endPart}`;
}

/** Dwell between arrival and departure, e.g. "2h 15m". */
export function formatDuration(startIso: string, endIso: string): string | null {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 42500 → "42,500 lbs" */
export function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('en-US')} lbs`;
}

export function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}
