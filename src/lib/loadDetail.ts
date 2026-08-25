import { supabase } from '@/integrations/supabase/client';
import { fetchLoadReferences, type StoredReference } from '@/lib/loadReferences';
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
  /** auth user id of the assigned driver — needed to open a load-linked chat. */
  driver_user_id: string | null;
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

/** Full claim row plus resolved people names, for the staff-only Claims section. */
export interface LoadClaim extends LoadClaimFlag {
  is_active: boolean;
  reported_by_contact: string | null;
  estimated_claim_amount: number | null;
  actual_claim_amount: number | null;
  documentation_url: string | null;
  resolution: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

export interface ClaimHistoryEntry {
  id: string;
  action: string;
  previous_flag_level: string | null;
  new_flag_level: string | null;
  previous_is_active: boolean | null;
  new_is_active: boolean | null;
  previous_resolution: string | null;
  new_resolution: string | null;
  previous_estimated_amount: number | null;
  new_estimated_amount: number | null;
  previous_actual_amount: number | null;
  new_actual_amount: number | null;
  change_source: string | null;
  notes: string | null;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
}

export interface LoadStatusHistoryEntry {
  id: string;
  previous_status: Database['public']['Enums']['load_status'] | null;
  new_status: Database['public']['Enums']['load_status'];
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  change_source: string | null;
  notes: string | null;
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
  let driverUserId: string | null = null;
  const operatorId = row.operator_id as string | null;
  if (operatorId) {
    const { data: op } = await supabase
      .from('operators')
      .select('user_id')
      .eq('id', operatorId)
      .maybeSingle();
    if (op?.user_id) {
      driverUserId = op.user_id;
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
    driver_user_id: driverUserId,
    dispatcher_name: nameOf(row.dispatcher as never),
    created_by_name: nameOf(row.creator as never),
  };
}

/** Every claim flag on a load, active first. Staff-only — never called for operators.
 *  The Pass 1 hold banner reads the active holds out of this same list so the page
 *  issues exactly one claim_flags request. */
export async function fetchLoadClaims(loadId: string): Promise<LoadClaim[]> {
  const { data, error } = await supabase
    .from('claim_flags')
    .select(
      'id, flag_level, claim_type, description, reported_at, is_active, reported_by_contact, ' +
      'estimated_claim_amount, actual_claim_amount, documentation_url, resolution, ' +
      'resolution_notes, resolved_at, resolved_by, created_by',
    )
    .eq('load_id', loadId)
    .order('reported_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as LoadClaim[];
  const names = await resolveProfileNames(
    rows.flatMap(r => [r.resolved_by, r.created_by]),
  );

  return rows
    .map(r => ({
      ...r,
      resolved_by_name: r.resolved_by ? names.get(r.resolved_by) ?? null : null,
      created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
    }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));
}

/** Append-only audit trail for one claim, newest first. Staff-only. */
export async function fetchClaimHistory(claimId: string): Promise<ClaimHistoryEntry[]> {
  const { data, error } = await supabase
    .from('claim_flag_history')
    .select(
      'id, action, previous_flag_level, new_flag_level, previous_is_active, new_is_active, ' +
      'previous_resolution, new_resolution, previous_estimated_amount, new_estimated_amount, ' +
      'previous_actual_amount, new_actual_amount, change_source, notes, changed_at, changed_by',
    )
    .eq('claim_flag_id', claimId)
    .order('changed_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ClaimHistoryEntry[];
  const names = await resolveProfileNames(rows.map(r => r.changed_by));
  return rows.map(r => ({
    ...r,
    changed_by_name: r.changed_by ? names.get(r.changed_by) ?? null : null,
  }));
}

/** Shared profile-name lookup: claim rows reference profiles without a traversable FK. */
async function resolveProfileNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  const names = new Map<string, string | null>();
  if (!unique.length) return names;
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', unique);
  (data ?? []).forEach(p => names.set(p.id, nameOf(p)));
  return names;
}

export type ClaimAction = 'raise' | 'resolve' | 'reopen';

export interface ManageClaimInput {
  action: ClaimAction;
  loadId?: string;
  claimId?: string;
  flagLevel?: Database['public']['Enums']['claim_flag_level'];
  claimType?: Database['public']['Enums']['claim_type'];
  description?: string;
  reportedByContact?: string | null;
  estimatedAmount?: number | null;
  documentationUrl?: string | null;
  resolution?: string;
  resolutionNotes?: string;
  actualAmount?: number | null;
  reason?: string;
}

const trimmed = (v: string | null | undefined) => {
  const s = (v ?? '').trim();
  return s ? s : null;
};

/** All claim mutations go through the role-gated definer function. */
export async function manageClaimFlag(input: ManageClaimInput): Promise<string> {
  const { data, error } = await rpc('manage_claim_flag', {
    p_action: input.action,
    p_load_id: input.loadId ?? null,
    p_claim_id: input.claimId ?? null,
    p_flag_level: input.flagLevel ?? null,
    p_claim_type: input.claimType ?? null,
    p_description: trimmed(input.description),
    p_reported_by_contact: trimmed(input.reportedByContact),
    p_estimated_amount: input.estimatedAmount ?? null,
    p_documentation_url: trimmed(input.documentationUrl),
    p_resolution: trimmed(input.resolution),
    p_resolution_notes: trimmed(input.resolutionNotes),
    p_actual_amount: input.actualAmount ?? null,
    p_reason: trimmed(input.reason),
  });
  if (error) throw error;
  return data as string;
}

/** Status history newest first, with changer names resolved from profiles. */
export async function fetchLoadStatusHistory(loadId: string): Promise<LoadStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('load_status_history')
    .select('id, previous_status, new_status, changed_at, changed_by, change_source, notes')
    .eq('load_id', loadId)
    .order('changed_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Omit<LoadStatusHistoryEntry, 'changed_by_name'>[];
  const ids = Array.from(new Set(rows.map(r => r.changed_by).filter(Boolean))) as string[];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', ids);
    (profs ?? []).forEach(p => names.set(p.id, nameOf(p)));
  }

  return rows.map(r => ({ ...r, changed_by_name: r.changed_by ? names.get(r.changed_by) ?? null : null }));
}

/** Server-enforced status change. Permissions and note rules live in the RPC. */
export async function updateLoadStatus(
  loadId: string, newStatus: Database['public']['Enums']['load_status'], note: string | null,
): Promise<void> {
  const { error } = await rpc('update_load_status', {
    p_load_id: loadId,
    p_new_status: newStatus,
    p_note: note && note.trim() ? note.trim() : null,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Driver assignment                                                    */
/* ------------------------------------------------------------------ */

export interface EligibilityIssue {
  code: string;
  message: string;
}

export interface DriverEligibility {
  operator_id: string;
  eligible: boolean;
  blocking: EligibilityIssue[];
  warnings: EligibilityIssue[];
}

export interface AssignableDriver {
  operatorId: string;
  userId: string;
  name: string;
  unitNumber: string | null;
  isActive: boolean;
}

type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** Untyped RPC escape hatch for functions that are not in the generated types.
 *  Keep this as a wrapper that invokes `supabase.rpc(...)` on the client itself.
 *  Never shorten it to `const rpc = supabase.rpc` — detaching the method drops its
 *  `this` binding and every call then fails at runtime with
 *  "can't access property 'rest', this is undefined". */
const rpc: RpcFn = (fn, args) =>
  (supabase.rpc as unknown as RpcFn).call(supabase, fn, args);

/** Operators selectable for assignment, newest naming resolved from applications. */
export async function fetchAssignableDrivers(): Promise<AssignableDriver[]> {
  const { data, error } = await supabase
    .from('operators')
    .select('id, user_id, unit_number, is_active, applications(first_name, last_name)');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(o => {
    const app = o.applications as { first_name: string | null; last_name: string | null } | null;
    return {
      operatorId: o.id as string,
      userId: o.user_id as string,
      name: nameOf(app) ?? 'Unknown',
      unitNumber: (o.unit_number as string | null) ?? null,
      isActive: o.is_active !== false,
    };
  });
}

/** Eligibility for many operators in one round trip, keyed by operator id. */
export async function fetchDriverEligibilityBulk(
  operatorIds: string[],
): Promise<Record<string, DriverEligibility>> {
  if (!operatorIds.length) return {};
  const { data, error } = await rpc('check_driver_eligibility_bulk', { p_operator_ids: operatorIds });
  if (error) throw error;
  return (data ?? {}) as Record<string, DriverEligibility>;
}

export interface AssignResult {
  success: boolean;
  auto_advanced: boolean;
  warnings: EligibilityIssue[];
}

export async function assignLoadDriver(
  loadId: string, operatorId: string, overrideReason: string | null,
): Promise<AssignResult> {
  const { data, error } = await rpc('assign_load_driver', {
    p_load_id: loadId,
    p_operator_id: operatorId,
    p_override_reason: overrideReason && overrideReason.trim() ? overrideReason.trim() : null,
  });
  if (error) throw error;
  return data as AssignResult;
}

export interface UnassignResult {
  success: boolean;
  status_reverted: boolean;
  warnings: EligibilityIssue[];
}

export async function unassignLoadDriver(loadId: string, reason: string): Promise<UnassignResult> {
  const { data, error } = await rpc('unassign_load_driver', {
    p_load_id: loadId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data as UnassignResult;
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

/* ------------------------------------------------------------------ */
/* Load editing                                                         */
/* ------------------------------------------------------------------ */

export type LoadChargeRow = Database['public']['Tables']['load_charges']['Row'];

export interface LoadEditData {
  load: LoadsRow;
  stops: StopRow[];
  charges: LoadChargeRow[];
  /** Stored reference rows with their per-stop citations. */
  references: StoredReference[];
}

/** Everything the load form needs to hydrate in edit mode. */
export async function fetchLoadForEdit(loadId: string): Promise<LoadEditData | null> {
  const { data: load, error } = await supabase
    .from('loads').select('*').eq('id', loadId).maybeSingle();
  if (error) throw error;
  if (!load) return null;

  // References are fetched here, not lazily: the form hydrates synchronously
  // from this payload, and a baseline that arrives after the diff is built is
  // the same as no baseline at all.
  const [{ data: stops, error: stopsError }, { data: charges, error: chargesError }, references] =
    await Promise.all([
      supabase.from('load_stops').select('*').eq('load_id', loadId).order('stop_sequence'),
      supabase.from('load_charges').select('*').eq('load_id', loadId).order('created_at'),
      fetchLoadReferences(loadId),
    ]);
  if (stopsError) throw stopsError;
  if (chargesError) throw chargesError;

  return {
    load: load as LoadsRow,
    stops: (stops ?? []) as StopRow[],
    charges: (charges ?? []) as LoadChargeRow[],
    references,
  };
}


export interface UpdateLoadInput {
  loadId: string;
  load: Record<string, unknown>;
  stops: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  reason?: string | null;
  unlockReason?: string | null;
  /** Set once the user has confirmed a stop with driver check-in data is being removed. */
  acknowledgeStopDataLoss?: boolean;
}

/** Atomic load + stops + charges update. All rules live in the definer function. */
export async function updateLoadWithStops(input: UpdateLoadInput): Promise<string> {
  const { data, error } = await rpc('update_load_with_stops', {
    p_load_id: input.loadId,
    p_load: input.load,
    p_stops: input.stops,
    p_charges: input.charges,
    p_reason: input.reason && input.reason.trim() ? input.reason.trim() : null,
    p_financial_unlock_reason:
      input.unlockReason && input.unlockReason.trim() ? input.unlockReason.trim() : null,
    p_ack_stop_data_loss: !!input.acknowledgeStopDataLoss,
  });
  if (error) throw error;
  return data as string;
}

export interface LoadChangeEntry {
  id: string;
  field_path: string;
  previous_value: string | null;
  new_value: string | null;
  is_financial: boolean;
  reason: string | null;
  change_source: string | null;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
}

/** Field-level edit trail, newest first. Staff-only — never called for operators. */
export async function fetchLoadChangeHistory(loadId: string): Promise<LoadChangeEntry[]> {
  const { data, error } = await supabase
    .from('load_change_history')
    .select('id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_at, changed_by')
    .eq('load_id', loadId)
    .order('changed_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as LoadChangeEntry[];
  const names = await resolveProfileNames(rows.map(r => r.changed_by));
  return rows.map(r => ({
    ...r,
    changed_by_name: r.changed_by ? names.get(r.changed_by) ?? null : null,
  }));
}
