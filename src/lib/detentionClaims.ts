import { supabase } from '@/integrations/supabase/client';
import { isoToNaive, naiveToIso } from '@/lib/carrierTimezone';

/**
 * The detention CLAIM RECORD — the conversation, not the money.
 *
 * Detention at SUPERTRANSPORT is negotiated. The driver calls his dispatcher,
 * the dispatcher emails the broker, and if the chase works the broker sends a
 * revised rate confirmation with detention on it. That document is the
 * authority, and the existing parse path is what turns it into a charge.
 *
 * So there is deliberately NO calculator here: no hours, no free time, no
 * eligible minutes, no dollar figure. Arrival and departure are EVIDENCE the
 * dispatcher pastes into the broker email, not inputs to a formula. What was
 * missing was any record that a claim is open, who raised it, when the broker
 * was told, and whether it died quietly — which is where detention is actually
 * lost.
 *
 * `resulting_charge_id` is set BY HAND. Nothing matches charges to claims
 * automatically, because a revised con carries one detention line and the load
 * may have several claims against it; guessing would attribute money to the
 * wrong chase.
 */

export type DetentionClaimStatus =
  | 'open'
  | 'notified'
  | 'in_discussion'
  | 'resolved_revision'
  | 'denied'
  | 'abandoned';

export type DetentionNotificationMethod = 'email' | 'phone' | 'text' | 'load_board';

export interface DetentionClaimRow {
  id: string;
  load_id: string;
  load_stop_id: string | null;
  driver_reported_at: string;
  reported_to: string | null;
  broker_notified_at: string | null;
  notified_by: string | null;
  notification_method: DetentionNotificationMethod | null;
  status: DetentionClaimStatus;
  resolution_note: string | null;
  resulting_charge_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
}

/** Row plus the people names the section shows. */
export interface DetentionClaim extends DetentionClaimRow {
  reported_to_name: string | null;
  notified_by_name: string | null;
}

export const DETENTION_STATUS_LABELS: Record<DetentionClaimStatus, string> = {
  open: 'Open — broker not yet told',
  notified: 'Broker notified',
  in_discussion: 'In discussion',
  resolved_revision: 'Resolved — revised rate con',
  denied: 'Denied by broker',
  abandoned: 'Abandoned',
};

export const DETENTION_METHOD_LABELS: Record<DetentionNotificationMethod, string> = {
  email: 'Email',
  phone: 'Phone',
  text: 'Text message',
  load_board: 'Load board message',
};

export const DETENTION_METHODS: DetentionNotificationMethod[] =
  ['email', 'phone', 'text', 'load_board'];

/**
 * Terminal statuses. A claim in one of these is finished being chased — which
 * is why claim age stops being shown for them.
 */
export const TERMINAL_DETENTION_STATUSES: DetentionClaimStatus[] =
  ['resolved_revision', 'denied', 'abandoned'];

export function isTerminalDetentionStatus(status: DetentionClaimStatus): boolean {
  return TERMINAL_DETENTION_STATUSES.includes(status);
}

/**
 * Where a claim can go from here. 'abandoned' is reachable from every live
 * status: most claims die without an answer, and forcing a dispatcher to
 * pretend one was denied would corrupt the only record of what happened.
 */
export const DETENTION_STATUS_TRANSITIONS: Record<DetentionClaimStatus, DetentionClaimStatus[]> = {
  open: ['notified', 'abandoned'],
  notified: ['in_discussion', 'resolved_revision', 'denied', 'abandoned'],
  in_discussion: ['resolved_revision', 'denied', 'abandoned'],
  resolved_revision: [],
  denied: [],
  abandoned: [],
};

export function nextDetentionStatuses(from: DetentionClaimStatus): DetentionClaimStatus[] {
  return DETENTION_STATUS_TRANSITIONS[from] ?? [];
}

export function canAdvanceDetentionStatus(
  from: DetentionClaimStatus,
  to: DetentionClaimStatus,
): boolean {
  return nextDetentionStatuses(from).includes(to);
}

/**
 * Whole days since the driver reported it — the signal that a claim is being
 * forgotten. Absent for terminal statuses, where age means nothing.
 * Industry guidance is to submit within about 48 hours; the number is shown so
 * a dispatcher can see a claim going stale, not to gate anything.
 */
export function detentionClaimAgeDays(
  claim: Pick<DetentionClaimRow, 'driver_reported_at' | 'status'>,
  now: Date = new Date(),
): number | null {
  if (isTerminalDetentionStatus(claim.status)) return null;
  const started = new Date(claim.driver_reported_at).getTime();
  if (!Number.isFinite(started)) return null;
  const ms = now.getTime() - started;
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** Carrier-timezone wall clock for a datetime-local input. Never `new Date(v)`. */
export const detentionToInputValue = (iso: string | null | undefined): string => isoToNaive(iso);

/** Carrier-timezone wall clock -> ISO instant, or null when empty. */
export function detentionFromInputValue(value: string): string | null {
  if (!value.trim()) return null;
  try {
    return naiveToIso(value.trim());
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

// detention_claims is staged in this draft, so it is not in the generated
// Database types yet. A narrow structural view keeps the calls typed against
// the shape this module owns instead of falling back to `any`.
type Res<T> = { data: T | null; error: { message: string } | null };
interface SelectChain<T> extends PromiseLike<Res<T[]>> {
  eq(column: string, value: unknown): SelectChain<T>;
  order(column: string, opts?: { ascending?: boolean }): SelectChain<T>;
}
interface TableApi<T> {
  select(columns?: string): SelectChain<T>;
  insert(row: Record<string, unknown>): PromiseLike<Res<unknown>>;
  update(patch: Record<string, unknown>): { eq(c: string, v: unknown): PromiseLike<Res<unknown>> };
  eq(column: string, value: unknown): TableApi<T>;
  in(column: string, values: unknown[]): TableApi<T>;
}

const claimsTable = () =>
  (supabase as unknown as { from(t: string): TableApi<DetentionClaimRow> })
    .from('detention_claims');

const nameOf = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null;

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', unique);
  if (error) throw error;
  (data ?? []).forEach(p => {
    const n = nameOf(p as { first_name: string | null; last_name: string | null });
    if (n) out.set((p as { id: string }).id, n);
  });
  return out;
}

export async function fetchDetentionClaims(loadId: string): Promise<DetentionClaim[]> {
  const { data, error } = await claimsTable()
    .select('*')
    .eq('load_id', loadId)
    .order('driver_reported_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DetentionClaimRow[];
  const names = await resolveNames(
    rows.flatMap(r => [r.reported_to, r.notified_by].filter(Boolean) as string[]),
  );
  return rows.map(r => ({
    ...r,
    reported_to_name: r.reported_to ? names.get(r.reported_to) ?? null : null,
    notified_by_name: r.notified_by ? names.get(r.notified_by) ?? null : null,
  }));
}

export interface RaiseDetentionClaimInput {
  loadId: string;
  loadStopId: string | null;
  /** Carrier wall clock, "YYYY-MM-DDTHH:mm". Defaults to now at the call site. */
  driverReportedAt: string;
}

/**
 * Raises a claim. The actor columns are stamped by the database trigger from
 * current_profile_id() — this never sends created_by, updated_by or
 * reported_to, so provenance cannot be overstated by whoever holds the
 * keyboard.
 */
export async function raiseDetentionClaim(
  input: RaiseDetentionClaimInput,
): Promise<DetentionClaimRow> {
  const reportedAt = detentionFromInputValue(input.driverReportedAt);
  if (!reportedAt) throw new Error('Enter when the driver reported the detention.');
  const id = crypto.randomUUID();
  const { error } = await claimsTable().insert({
    id,
    load_id: input.loadId,
    load_stop_id: input.loadStopId,
    driver_reported_at: reportedAt,
    status: 'open',
  });
  if (error) throw new Error(error.message);
  const { data, error: readError } = await claimsTable().select('*').eq('id', id);
  if (readError) throw new Error(readError.message);
  const row = (data ?? [])[0];
  if (!row) throw new Error('The claim was written but could not be read back.');
  return row;
}

export interface RecordDetentionNotificationInput {
  claimId: string;
  /** Carrier wall clock, or '' to clear the notification. */
  brokerNotifiedAt: string;
  method: DetentionNotificationMethod | '';
}

/** Records when and how the broker was told. Does not move the status. */
export async function recordDetentionNotification(
  input: RecordDetentionNotificationInput,
): Promise<void> {
  const notifiedAt = detentionFromInputValue(input.brokerNotifiedAt);
  const { error } = await claimsTable()
    .update({
      broker_notified_at: notifiedAt,
      notification_method: notifiedAt ? (input.method || null) : null,
    })
    .eq('id', input.claimId);
  if (error) throw new Error(error.message);
}

export interface AdvanceDetentionStatusInput {
  claimId: string;
  from: DetentionClaimStatus;
  to: DetentionClaimStatus;
  resolutionNote?: string;
  /** load_charges row the revised con produced. Optional, always. */
  resultingChargeId?: string | null;
}

/**
 * THE one writer for status. Every transition goes through here so the legal
 * transition map is enforced in a single place rather than at each button.
 *
 * `resolution_note` and `resulting_charge_id` are optional even for
 * 'resolved_revision': the transition is a fact about the conversation, and a
 * dispatcher who has the revised con in hand but not yet the charge row must
 * be able to say so rather than leave the claim open.
 */
export async function advanceDetentionClaimStatus(
  input: AdvanceDetentionStatusInput,
): Promise<void> {
  if (!canAdvanceDetentionStatus(input.from, input.to)) {
    throw new Error(
      isTerminalDetentionStatus(input.from)
        ? `A ${DETENTION_STATUS_LABELS[input.from].toLowerCase()} claim cannot be moved again.`
        : `A claim cannot move from ${input.from} to ${input.to}.`,
    );
  }
  const patch: Record<string, unknown> = { status: input.to };
  const note = (input.resolutionNote ?? '').trim();
  if (note) patch.resolution_note = note;
  if (input.to === 'resolved_revision') {
    patch.resulting_charge_id = input.resultingChargeId || null;
  }
  const { error } = await claimsTable().update(patch).eq('id', input.claimId);
  if (error) throw new Error(error.message);
}
