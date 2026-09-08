import { supabase } from '@/integrations/supabase/client';
import { formatFuelDate } from './fuelBuckets';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';
import type { FuelDisagreement } from './fuelImport';

/**
 * WHY A ROW COULD NOT BE MATCHED, AND WHY A MATCH DISAGREED.
 *
 * "Unmatched" and "Matched, disagreement" were the whole of what the screen
 * said. They cover three different problems with three different fixes: the
 * card is not in inventory, the card is in inventory but held by nobody, or the
 * card IS held but not on the day of the transaction. Only the third one is a
 * data correction on an assignment date, and it is the one the owner hit.
 *
 * THIS FILE DIAGNOSES; IT DOES NOT MATCH. `fuel_resolve_card` is the only
 * matcher and it is correct — its date window is what caught Ali Mohamed's
 * card 224 accurately. Nothing here widens it, falls back to the most recent
 * assignment, or matches on the printed unit or driver name.
 */

/* ------------------------------------------------------------------ */
/* 1. Unmatched                                                        */
/* ------------------------------------------------------------------ */

export interface CardAssignmentWindow {
  operatorName: string;
  assignedAt: string;              // ISO date
  returnedAt: string | null;       // ISO date, null = open
}

export type UnmatchedReason =
  | { kind: 'no_such_card' }
  | { kind: 'never_assigned' }
  | { kind: 'assigned_later'; window: CardAssignmentWindow }
  | { kind: 'returned_earlier'; window: CardAssignmentWindow };

const dateOnly = (v: string | null | undefined): string =>
  String(v ?? '').slice(0, 10);

/**
 * Pick the assignment that best explains the miss: the one nearest the
 * transaction date. A card with a gap between two holders should say which
 * side of the gap the transaction fell on.
 */
export function diagnoseUnmatched(
  cardExists: boolean,
  assignments: CardAssignmentWindow[],
  txDate: string,
): UnmatchedReason {
  if (!cardExists) return { kind: 'no_such_card' };
  if (assignments.length === 0) return { kind: 'never_assigned' };

  const day = dateOnly(txDate);
  const after = assignments
    .filter((a) => dateOnly(a.assignedAt) > day)
    .sort((a, b) => dateOnly(a.assignedAt).localeCompare(dateOnly(b.assignedAt)));
  const before = assignments
    .filter((a) => a.returnedAt && dateOnly(a.returnedAt) < day)
    .sort((a, b) => dateOnly(b.returnedAt).localeCompare(dateOnly(a.returnedAt)));

  const gapDays = (from: string, to: string) =>
    Math.abs(Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`));

  if (after.length > 0 && before.length > 0) {
    return gapDays(day, dateOnly(before[0].returnedAt)) <= gapDays(day, dateOnly(after[0].assignedAt))
      ? { kind: 'returned_earlier', window: before[0] }
      : { kind: 'assigned_later', window: after[0] };
  }
  if (after.length > 0) return { kind: 'assigned_later', window: after[0] };
  if (before.length > 0) return { kind: 'returned_earlier', window: before[0] };
  // An assignment covering the date exists, so the resolver would have matched.
  return { kind: 'never_assigned' };
}

/** The sentence shown on the row. */
export function unmatchedReasonMessage(
  cardNo: string,
  txDate: string,
  reason: UnmatchedReason,
): string {
  const card = `Card ${cardNo}`;
  const dated = `This transaction is dated ${formatFuelDate(txDate)}`;
  switch (reason.kind) {
    case 'no_such_card':
      return `${card} is not in SUPERDRIVE. No fuel card with that number exists in equipment inventory.`;
    case 'never_assigned':
      return `${card} is in equipment inventory but is not assigned to anyone.`;
    case 'assigned_later':
      return `${card} is assigned to ${reason.window.operatorName} from `
        + `${formatFuelDate(reason.window.assignedAt)}. ${dated}, before that assignment began.`;
    case 'returned_earlier':
      return `${card} was assigned to ${reason.window.operatorName} from `
        + `${formatFuelDate(reason.window.assignedAt)} until `
        + `${formatFuelDate(reason.window.returnedAt)}. ${dated}, after that assignment ended.`;
  }
}

/* ------------------------------------------------------------------ */
/* 2. Disagreement                                                     */
/* ------------------------------------------------------------------ */

/**
 * WHERE OUR VALUE COMES FROM. `fuel_resolve_card` returns
 * COALESCE(onboarding_status.unit_number, operators.unit_number), so a stale
 * value in the onboarding record SHADOWS a correct one on the operator. Naming
 * the source is the difference between "ours is wrong" and "ours is wrong
 * HERE".
 */
export type DisagreementSource = 'onboarding' | 'operator' | 'profile' | 'unknown';

export const DISAGREEMENT_SOURCE_LABELS: Record<DisagreementSource, string> = {
  onboarding: 'from onboarding record',
  operator:   'from operator record',
  profile:    'from profile',
  unknown:    'source unknown',
};

export interface OperatorSourceValues {
  onboardingUnit: string | null;
  operatorUnit: string | null;
}

export function sourceOfDisagreement(
  field: FuelDisagreement['field'],
  values: OperatorSourceValues | null,
): DisagreementSource {
  if (field === 'driver_name') return 'profile';
  if (!values) return 'unknown';
  if ((values.onboardingUnit ?? '').trim() !== '') return 'onboarding';
  if ((values.operatorUnit ?? '').trim() !== '') return 'operator';
  return 'unknown';
}

const FIELD_LABELS: Record<FuelDisagreement['field'], string> = {
  unit_no: 'Unit',
  driver_name: 'Driver',
};

export function disagreementMessage(
  d: FuelDisagreement,
  source: DisagreementSource,
): string {
  return `${FIELD_LABELS[d.field]}: file says ${d.csv_value || '—'}, `
    + `SUPERDRIVE says ${d.system_value || '—'} (${DISAGREEMENT_SOURCE_LABELS[source]}).`;
}

/** Every field that disagreed, not just the first. */
export function disagreementMessages(
  fields: FuelDisagreement[],
  values: OperatorSourceValues | null,
): string[] {
  return fields.map((d) => disagreementMessage(d, sourceOfDisagreement(d.field, values)));
}

/* ------------------------------------------------------------------ */
/* 3. Reads                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read-only. Staff already hold SELECT on both equipment tables, so this needs
 * no new database function and does not touch the resolver.
 */
export async function fetchCardAssignments(cardNo: string): Promise<{
  cardExists: boolean;
  assignments: CardAssignmentWindow[];
}> {
  const serial = cardNo.trim();
  const { data: items, error: itemErr } = await supabase
    .from('equipment_items')
    .select('id, serial_number')
    .eq('device_type', 'fuel_card');
  if (itemErr) throw itemErr;

  const match = (items ?? []).filter(
    (i) => (i.serial_number ?? '').trim().toUpperCase() === serial.toUpperCase(),
  );
  if (match.length === 0) return { cardExists: false, assignments: [] };

  const { data: rows, error } = await supabase
    .from('equipment_assignments')
    .select('assigned_at, returned_at, operator_id, operators(user_id, unit_number)')
    .in('equipment_id', match.map((i) => i.id));
  if (error) throw error;

  const userIds = (rows ?? []).map(
    (r) => (r as { operators?: { user_id?: string | null } | null }).operators?.user_id ?? null,
  );
  const names = await fetchProfileNames(userIds);

  const assignments = (rows ?? []).map((r) => {
    const op = (r as { operators?: { user_id?: string | null } | null }).operators;
    return {
      operatorName: formatProfileName(op?.user_id ? names.get(op.user_id) : null),
      assignedAt: dateOnly(r.assigned_at as string),
      returnedAt: r.returned_at ? dateOnly(r.returned_at as string) : null,
    };
  });
  return { cardExists: true, assignments };
}

/** The two unit numbers behind the resolver's COALESCE, for one operator. */
export async function fetchOperatorSourceValues(
  operatorId: string,
): Promise<OperatorSourceValues> {
  const [op, ob] = await Promise.all([
    supabase.from('operators').select('unit_number').eq('id', operatorId).maybeSingle(),
    supabase.from('onboarding_status').select('unit_number').eq('operator_id', operatorId).maybeSingle(),
  ]);
  if (op.error) throw op.error;
  if (ob.error) throw ob.error;
  return {
    onboardingUnit: (ob.data?.unit_number as string | null) ?? null,
    operatorUnit: (op.data?.unit_number as string | null) ?? null,
  };
}
