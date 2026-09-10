import { supabase } from '@/integrations/supabase/client';

/**
 * LATE ACCESSORIALS — the client side of the five protected writers.
 *
 * Nothing here decides anything. Every rule that matters (who may approve, what
 * proof is required, what the reference is, what billing state means) is
 * enforced inside the database functions; this file calls them and renders what
 * comes back. Where a value is duplicated for display — the proof map, the
 * approval ceiling — it is a MIRROR of the server rule, never the rule itself,
 * and a mismatch shows up as a server refusal rather than a silent divergence.
 */

export const ADJUSTMENT_STATUSES = [
  'draft', 'pending_approval', 'approved', 'settled', 'rejected', 'void',
] as const;

export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

export const ADJUSTMENT_STATUS_LABELS: Record<AdjustmentStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  settled: 'Settled',
  rejected: 'Rejected',
  void: 'Void',
};

export type ProofKind = 'broker_agreement' | 'receipt' | 'any_document';

export const PROOF_KIND_LABELS: Record<ProofKind, string> = {
  broker_agreement: "the broker's written agreement",
  receipt: 'the receipt',
  any_document: 'a supporting document',
};

/**
 * MIRROR of public.accessorial_proof_kind(text).
 *
 * PROPOSED BY THE BUILD 2026-09-10, NOT STATED BY THE OWNER. He said backup
 * documents are required and that what counts depends on the charge type; this
 * particular mapping is the build's inference and is to be corrected once real
 * ones have been seen.
 *
 * TOTAL by construction. An unlisted charge type falls to `any_document`, so no
 * kind of late accessorial can become impossible to submit — the record already
 * contains one case of an unmapped category silently vanishing.
 */
export function proofKindFor(chargeType: string): ProofKind {
  switch ((chargeType || '').toLowerCase()) {
    case 'detention':
    case 'layover':
    case 'tonu':
    case 'stopoff':
      return 'broker_agreement';
    case 'lumper':
    case 'reimbursement':
      return 'receipt';
    default:
      return 'any_document';
  }
}

export const BILLING_STATE_LABELS: Record<string, string> = {
  not_required: 'No supplemental invoice needed',
  pending_supplemental: 'Needs a supplemental invoice',
  billed: 'On a supplemental invoice',
};

export interface AdjustmentRecord {
  /** Filled by the readers below — never by the table. */
  created_by_name?: string | null;
  approved_by_name?: string | null;
  settlement_period_start?: string | null;
  settlement_period_end?: string | null;
  settlement_status?: string | null;
  id: string;
  load_id: string;
  reference: string;
  sequence: number;
  charge_type: string;
  description: string | null;
  amount: number;
  funding_source: string | null;
  actual_cost: number | null;
  proof_document_id: string | null;
  proof_kind: string | null;
  status: AdjustmentStatus;
  reason: string | null;
  billing_state: string;
  approved_at: string | null;
  approved_by: string | null;
  settlement_id: string | null;
  invoice_id: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
}

const COLUMNS =
  'id, load_id, reference, sequence, charge_type, description, amount, funding_source,'
  + ' actual_cost, proof_document_id, proof_kind, status, reason, billing_state,'
  + ' approved_at, approved_by, settlement_id, invoice_id, created_at, created_by, updated_at';

function rows(data: unknown): AdjustmentRecord[] {
  return ((data ?? []) as AdjustmentRecord[]).map(r => ({ ...r, amount: Number(r.amount) }));
}

/**
 * Names and settlement state, resolved in two batched reads.
 *
 * Money surfaces in this app name the person who acted; these two columns hold
 * profile ids, so the row cannot say who without this.
 */
async function enrich<T extends AdjustmentRecord>(list: T[]): Promise<T[]> {
  const profileIds = Array.from(new Set(
    list.flatMap(r => [r.created_by, r.approved_by]).filter(Boolean) as string[],
  ));
  const settlementIds = Array.from(new Set(list.map(r => r.settlement_id).filter(Boolean) as string[]));

  const [names, settlements] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, first_name, last_name').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
    settlementIds.length
      ? supabase.from('settlements').select('id, period_start, period_end, status').in('id', settlementIds)
      : Promise.resolve({ data: [] as { id: string; period_start: string; period_end: string; status: string }[] }),
  ]);

  const nameById = new Map<string, string | null>();
  ((names.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[])
    .forEach(p => nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null));
  const settlementById = new Map<string, { period_start: string; period_end: string; status: string }>();
  ((settlements.data ?? []) as { id: string; period_start: string; period_end: string; status: string }[])
    .forEach(s => settlementById.set(s.id, s));

  return list.map(r => {
    const s = r.settlement_id ? settlementById.get(r.settlement_id) : undefined;
    return {
      ...r,
      created_by_name: r.created_by ? nameById.get(r.created_by) ?? null : null,
      approved_by_name: r.approved_by ? nameById.get(r.approved_by) ?? null : null,
      settlement_period_start: s?.period_start ?? null,
      settlement_period_end: s?.period_end ?? null,
      settlement_status: s?.status ?? null,
    };
  });
}

/** Every adjustment on one load, oldest reference first. */
export async function fetchLoadAdjustments(loadId: string): Promise<AdjustmentRecord[]> {
  const { data, error } = await supabase
    .from('accessorial_adjustments')
    .select(COLUMNS)
    .eq('load_id', loadId)
    .order('sequence', { ascending: true });
  if (error) throw new Error(error.message);
  return enrich(rows(data));
}

export interface AdjustmentListRow extends AdjustmentRecord {
  load_number: string | null;
}

/** The review list. Newest first, because the queue is worked from the top. */
export async function fetchAdjustments(status?: AdjustmentStatus): Promise<AdjustmentListRow[]> {
  let q = supabase
    .from('accessorial_adjustments')
    .select(`${COLUMNS}, loads:load_id (load_number)`)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as unknown[]).map(r => {
    const row = r as AdjustmentRecord & { loads?: { load_number: string | null } | null };
    return { ...row, amount: Number(row.amount), load_number: row.loads?.load_number ?? null };
  });
  return enrich(list);
}

/** How many are waiting on somebody. Drives the sidebar count. */
export async function fetchPendingAdjustmentCount(): Promise<number> {
  const { count, error } = await supabase
    .from('accessorial_adjustments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * The dispatcher ceiling, for DISPLAY only.
 *
 * `approve_accessorial_adjustment` reads this itself and never accepts it as an
 * argument, so this read cannot influence an approval — it exists so the screen
 * can say why a button is absent.
 */
export async function fetchDispatcherApprovalLimit(): Promise<number | null> {
  const { data, error } = await supabase
    .from('settlement_settings')
    .select('dispatcher_accessorial_approval_limit')
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data as { dispatcher_accessorial_approval_limit: number | null } | null)
    ?.dispatcher_accessorial_approval_limit;
  return raw === null || raw === undefined ? null : Number(raw);
}

export interface AdjustmentDraftInput {
  chargeType: string;
  amount: string;
  description: string;
  reason: string;
  funding_source: string;
  actual_cost: string;
  proof_document_id: string;
}

export async function createAdjustment(loadId: string, input: AdjustmentDraftInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_accessorial_adjustment', {
    p_load_id: loadId,
    p_charge_type: input.chargeType,
    p_amount: Number(input.amount),
    p_reason: input.reason,
    p_description: input.description || null,
    p_funding_source: input.funding_source || null,
    p_actual_cost: input.actual_cost ? Number(input.actual_cost) : null,
    p_proof_document_id: input.proof_document_id || null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function submitAdjustment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('submit_accessorial_adjustment', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function approveAdjustment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('approve_accessorial_adjustment', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function rejectAdjustment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_accessorial_adjustment', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function voidAdjustment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_accessorial_adjustment', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* What a screen may offer — mirrors the transition matrix              */
/* ------------------------------------------------------------------ */

export type AdjustmentAction = 'submit' | 'approve' | 'reject' | 'void';

export interface ActorRoles {
  isDispatcher: boolean;
  isManagement: boolean;
}

/**
 * Approval eligibility as the server computes it. `limit` NULL means a
 * dispatcher approves nothing, which is the rule that applied before the
 * setting existed.
 */
export function canApprove(
  roles: ActorRoles, amount: number, limit: number | null,
): { allowed: boolean; why: string | null } {
  if (roles.isManagement) return { allowed: true, why: null };
  if (!roles.isDispatcher) return { allowed: false, why: 'Only management or the owner may approve this.' };
  if (limit === null) {
    return {
      allowed: false,
      why: 'No dispatcher approval limit is set, so management or the owner must approve this.',
    };
  }
  if (amount >= limit) {
    return {
      allowed: false,
      why: `This is at or above the ${limit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} dispatcher limit, so management or the owner must approve it.`,
    };
  }
  return { allowed: true, why: null };
}

export function availableActions(
  row: AdjustmentRecord, roles: ActorRoles, limit: number | null,
): AdjustmentAction[] {
  const out: AdjustmentAction[] = [];
  if (row.status === 'draft') out.push('submit');
  if (row.status === 'pending_approval') {
    if (canApprove(roles, row.amount, limit).allowed) out.push('approve');
    if (roles.isManagement) out.push('reject');
  }
  // Settled money is not ours to undo, and an approved row is frozen — void and
  // re-enter is the only correction the state machine allows.
  if (row.status !== 'settled' && row.status !== 'void' && row.status !== 'rejected'
      && roles.isManagement) {
    out.push('void');
  }
  return out;
}

/** Hours a pending adjustment has been waiting. Drives the over-a-day banner. */
export function hoursWaiting(row: AdjustmentRecord, now: Date = new Date()): number {
  return (now.getTime() - new Date(row.created_at).getTime()) / 3_600_000;
}

export function isOverdue(row: AdjustmentRecord, now: Date = new Date()): boolean {
  return row.status === 'pending_approval' && hoursWaiting(row, now) > 24;
}

/**
 * Points a DRAFT adjustment at a load document that already exists.
 *
 * The upload itself goes through the ordinary load-document path; this only
 * records which of those documents is the backup for this adjustment. The
 * database refuses anything that is not a draft and anything belonging to
 * another load.
 */
export async function attachAdjustmentProof(id: string, documentId: string): Promise<void> {
  const { error } = await supabase.rpc('attach_accessorial_adjustment_proof', {
    p_id: id,
    p_proof_document_id: documentId,
  });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Backup documentation — what is true of THIS row, not what a rule says */
/* ------------------------------------------------------------------ */

export type ProofState = 'attached' | 'required' | 'grandfathered';

/**
 * Proof was made mandatory at SUBMIT on 2026-09-10. Rows approved before that
 * exist and are legitimate: they were approved under the rule of the day. Such
 * a row must never be told what it needs before it can be sent for approval —
 * it cannot be sent for approval, it is already past that point. Saying so is
 * how a future reader tells a grandfathered row from a broken rule.
 */
export function proofState(row: Pick<AdjustmentRecord, 'proof_document_id' | 'status'>): ProofState {
  if (row.proof_document_id) return 'attached';
  return row.status === 'draft' || row.status === 'pending_approval' ? 'required' : 'grandfathered';
}

/** Why the row cannot be sent for approval, or null when it can. */
export function submitBlockedReason(row: AdjustmentRecord): string | null {
  if (row.status !== 'draft') return null;
  if (row.proof_document_id) return null;
  const kind = (row.proof_kind as ProofKind | null) ?? proofKindFor(row.charge_type);
  return `Attach ${PROOF_KIND_LABELS[kind]} first.`;
}

export function actionBlockedReason(row: AdjustmentRecord, action: AdjustmentAction): string | null {
  return action === 'submit' ? submitBlockedReason(row) : null;
}
