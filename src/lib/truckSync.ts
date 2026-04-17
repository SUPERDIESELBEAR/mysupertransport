import { supabase } from '@/integrations/supabase/client';

export interface TruckSpecsPayload {
  truck_year?: string | null;
  truck_make?: string | null;
  truck_vin?: string | null;
  truck_plate?: string | null;
  truck_plate_state?: string | null;
  trailer_number?: string | null;
  unit_number?: string | null;
}

const NORMALIZED_TRUCK_FIELDS = [
  'truck_year',
  'truck_make',
  'truck_vin',
  'truck_plate',
  'truck_plate_state',
  'trailer_number',
  'unit_number',
] as const;

// ICA contracts table doesn't store unit_number — only the six truck fields
const ICA_TRUCK_FIELDS = [
  'truck_year',
  'truck_make',
  'truck_vin',
  'truck_plate',
  'truck_plate_state',
  'trailer_number',
] as const;

/** Normalize a VIN: trim, uppercase, strip dashes/spaces/dots */
function normalizeVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const cleaned = vin.trim().replace(/[-.\s]/g, '').toUpperCase();
  return cleaned || null;
}

/** Convert empty strings to null and normalize VIN */
function cleanPayload(payload: TruckSpecsPayload): Partial<Record<typeof NORMALIZED_TRUCK_FIELDS[number], string | null>> {
  const out: Record<string, string | null> = {};
  for (const key of NORMALIZED_TRUCK_FIELDS) {
    if (!(key in payload)) continue;
    const raw = payload[key];
    if (raw === undefined) continue;
    if (key === 'truck_vin') {
      out[key] = normalizeVin(raw);
    } else {
      const trimmed = typeof raw === 'string' ? raw.trim() : raw;
      out[key] = trimmed === '' ? null : (trimmed ?? null);
    }
  }
  return out;
}

/**
 * Filter an object to only include keys with non-null, non-empty values.
 * Used to enforce coalesce(new, old) semantics — half-filled forms can't blank existing data.
 */
function dropEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') {
      (out as any)[k] = v;
    }
  }
  return out;
}

/** Build a diff for audit metadata: only fields where old ≠ new */
function buildDiff(
  before: Record<string, any> | null,
  after: Record<string, any>,
): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before?.[k] ?? null;
    if (prev !== v) diff[k] = { from: prev, to: v };
  }
  return diff;
}

export interface SaveTruckSpecsOptions {
  /** Skip writing to onboarding_status (useful when a separate flow already wrote it) */
  skipOnboardingStatus?: boolean;
  /** Skip writing to ica_contracts mirror */
  skipIcaMirror?: boolean;
  /** Display label for audit log */
  entityLabel?: string;
}

export interface SaveTruckSpecsResult {
  ok: boolean;
  changed: string[];
  error?: string;
}

/**
 * Centralized save for truck specs across `onboarding_status` and active `ica_contracts`.
 *
 * - Always updates `onboarding_status` (unless skipOnboardingStatus is true)
 * - Mirrors to ICA contracts only where status IN ('draft','sent_to_operator')
 *   — never overwrites signed contracts
 * - Empty/whitespace values are dropped (won't blank existing data)
 * - VIN is normalized (uppercase, trim, strip dashes/spaces)
 * - Writes one audit_log entry per save with the diff
 */
export async function saveTruckSpecs(
  operatorId: string,
  statusId: string | null,
  payload: TruckSpecsPayload,
  actorId: string | null,
  options: SaveTruckSpecsOptions = {},
): Promise<SaveTruckSpecsResult> {
  const cleaned = cleanPayload(payload);
  const writable = dropEmpty(cleaned);

  if (Object.keys(writable).length === 0) {
    return { ok: true, changed: [] };
  }

  // Read previous values for audit diff
  let before: Record<string, any> | null = null;
  if (statusId) {
    const { data } = await supabase
      .from('onboarding_status')
      .select('truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number, unit_number')
      .eq('id', statusId)
      .maybeSingle();
    before = data as Record<string, any> | null;
  } else if (operatorId) {
    const { data } = await supabase
      .from('onboarding_status')
      .select('truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number, unit_number')
      .eq('operator_id', operatorId)
      .maybeSingle();
    before = data as Record<string, any> | null;
  }

  // 1. Write to onboarding_status
  if (!options.skipOnboardingStatus) {
    let updateQuery = supabase.from('onboarding_status').update(writable as any);
    if (statusId) {
      updateQuery = updateQuery.eq('id', statusId);
    } else {
      updateQuery = updateQuery.eq('operator_id', operatorId);
    }
    const { error } = await updateQuery;
    if (error) {
      return { ok: false, changed: [], error: error.message };
    }
  }

  // 2. Mirror to active ICA contracts (draft + sent_to_operator only)
  if (!options.skipIcaMirror) {
    const icaPayload: Record<string, any> = {};
    for (const k of ICA_TRUCK_FIELDS) {
      if (k in writable) icaPayload[k] = (writable as any)[k];
    }
    if (Object.keys(icaPayload).length > 0) {
      await supabase
        .from('ica_contracts')
        .update(icaPayload)
        .eq('operator_id', operatorId)
        .in('status', ['draft', 'sent_to_operator']);
      // Don't fail the entire op if mirror fails — onboarding_status is the source of truth
    }
  }

  // 3. Audit log
  const diff = buildDiff(before, writable);
  if (Object.keys(diff).length > 0) {
    let actorName: string | null = null;
    if (actorId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', actorId)
        .maybeSingle();
      if (prof) {
        actorName = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim() || null;
      }
    }
    await supabase.from('audit_log').insert({
      actor_id: actorId,
      actor_name: actorName,
      action: 'truck_specs_updated',
      entity_type: 'operator',
      entity_id: operatorId,
      entity_label: options.entityLabel ?? null,
      metadata: { diff },
    });
  }

  return { ok: true, changed: Object.keys(diff) };
}
