import { supabase } from '@/integrations/supabase/client';
import { nameScore } from '@/lib/rateConfirmation';

/**
 * Duplicate broker reference detection for the Create Load form.
 *
 * Warn, never block: there are legitimate reasons the same broker reference
 * appears twice (cancel-and-rebook, numbers reused across years, split loads,
 * a correction after a bad save). So this surfaces the existing load and lets
 * the dispatcher decide. No uniqueness constraint exists, deliberately.
 *
 * Everything below the fetch helpers is pure so the rules can be tested
 * without a network.
 */

export interface DuplicateCandidateStop {
  stop_sequence: number;
  stop_type: string;
  facility_name: string | null;
  city: string | null;
  state: string | null;
}

export interface DuplicateCandidateLoad {
  id: string;
  load_number: string;
  status: string;
  created_at: string;
  created_by: string | null;
  broker_id: string | null;
  broker_reference_number: string | null;
  stops: DuplicateCandidateStop[];
  /** Resolved for display only — never part of the matching rules. */
  created_by_name?: string | null;
  broker_name?: string | null;
}

export type DuplicateConfidence = 'confident' | 'probable';

export interface DuplicateMatch {
  load: DuplicateCandidateLoad;
  confidence: DuplicateConfidence;
}

/** Case-, space- and punctuation-insensitive comparison key for a broker reference. */
export function normalizeReference(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface DuplicateCheckInput {
  /** The reference on the load being created. */
  reference: string | null | undefined;
  /** The linked broker, when the dispatcher has confirmed one. */
  brokerId: string | null | undefined;
  /**
   * Broker ids whose company name matches the name read off the document.
   * Only consulted when no broker is linked yet — a parsed load before the
   * dispatcher confirms the broker match.
   */
  brokerIdsFromName?: string[];
  candidates: DuplicateCandidateLoad[];
}

/**
 * Matching requires the same broker AND the same reference. A reference alone is
 * never enough — brokers reuse the same sequence ranges, so that would be a
 * false-positive machine. Cancelled loads never match: cancel-and-rebook under
 * the same reference is legitimate.
 */
export function findDuplicateMatches(input: DuplicateCheckInput): DuplicateMatch[] {
  const ref = normalizeReference(input.reference);
  if (!ref) return [];

  const brokerId = input.brokerId || '';
  const nameIds = new Set((input.brokerIdsFromName ?? []).filter(Boolean));

  const matches: DuplicateMatch[] = [];

  input.candidates.forEach(load => {
    if (load.status === 'cancelled') return;
    if (normalizeReference(load.broker_reference_number) !== ref) return;

    if (brokerId) {
      if (load.broker_id === brokerId) matches.push({ load, confidence: 'confident' });
      return;
    }

    // No broker linked yet — fall back to the extracted broker name, and say so.
    if (load.broker_id && nameIds.has(load.broker_id)) {
      matches.push({ load, confidence: 'probable' });
    }
  });

  return matches;
}

/** True when at least one match is a same-broker, same-reference hit. */
export function duplicateConfidence(matches: DuplicateMatch[]): DuplicateConfidence | null {
  if (matches.length === 0) return null;
  return matches.some(m => m.confidence === 'confident') ? 'confident' : 'probable';
}

/** One line per stop, short enough for the warning dialog. */
export function stopSummary(stops: DuplicateCandidateStop[]): string {
  return [...stops]
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map(s => [s.facility_name, [s.city, s.state].filter(Boolean).join(', ')]
      .filter(Boolean).join(' — '))
    .filter(Boolean)
    .join('  →  ');
}

export interface DuplicateOverrideEntry {
  loadId: string;
  fieldPath: string;
  previousValue: string;
  newValue: string;
  reason: string;
}

/**
 * The two change-history entries a "create anyway" writes — one per load, so the
 * relationship reads correctly from whichever load someone opens six weeks later.
 * Mirrors `record_duplicate_broker_reference` in the database.
 */
export function buildDuplicateOverrideEntries(args: {
  newLoadId: string;
  newLoadNumber: string;
  existingLoadId: string;
  existingLoadNumber: string;
  reference: string;
  reason: string;
}): DuplicateOverrideEntry[] {
  const reason = args.reason.trim();
  const ref = args.reference.trim() || '—';
  return [
    {
      loadId: args.newLoadId,
      fieldPath: 'duplicate_broker_reference',
      previousValue: `Existing load ${args.existingLoadNumber} (${args.existingLoadId})`,
      newValue: `Created anyway with broker reference ${ref}`,
      reason,
    },
    {
      loadId: args.existingLoadId,
      fieldPath: 'duplicate_created_against_this_load',
      previousValue: `Broker reference ${ref}`,
      newValue: `Duplicate load ${args.newLoadNumber} (${args.newLoadId}) was created anyway`,
      reason,
    },
  ];
}

// ── Data access ────────────────────────────────────────────────────────────

/** Broker ids whose company name looks like the name read off the document. */
export async function brokerIdsMatchingName(name: string | null | undefined): Promise<string[]> {
  const wanted = (name ?? '').trim();
  if (!wanted) return [];
  const { data, error } = await supabase.from('brokers').select('id, company_name');
  if (error) throw error;
  return (data ?? [])
    .filter(b => nameScore(wanted, b.company_name ?? '') >= 0.5)
    .map(b => b.id);
}

/** Non-cancelled loads carrying this broker reference, with the detail the dialog shows. */
export async function fetchDuplicateCandidates(
  reference: string, excludeLoadId?: string | null,
): Promise<DuplicateCandidateLoad[]> {
  const ref = reference.trim();
  if (!ref) return [];

  const { data, error } = await supabase
    .from('loads')
    .select(`
      id, load_number, status, created_at, created_by, broker_id, broker_reference_number,
      broker:brokers(company_name),
      stops:load_stops(stop_sequence, stop_type, facility_name, city, state)
    `)
    .neq('status', 'cancelled')
    .not('broker_reference_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const target = normalizeReference(ref);
  const rows = (data ?? [])
    .filter(row => row.id !== excludeLoadId)
    .filter(row => normalizeReference(row.broker_reference_number) === target);

  // Who created it matters for the dispatcher's judgement call, so resolve the name.
  const creatorIds = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (creatorIds.length) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, first_name, last_name').in('id', creatorIds);
    (profiles ?? []).forEach(p => {
      const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
      if (full) names.set(p.id, full);
    });
  }

  return rows.map(row => ({
    id: row.id,
    load_number: row.load_number,
    status: row.status,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.created_by ? names.get(row.created_by) ?? null : null,
    broker_id: row.broker_id,
    broker_reference_number: row.broker_reference_number,
    broker_name: (row.broker as { company_name?: string } | null)?.company_name ?? null,
    stops: (row.stops ?? []) as DuplicateCandidateStop[],
  }));
}


/** Runs the whole check: candidates + name fallback + the pure classifier. */
/**
 * @parser-check
 * Warns when a broker reference already belongs to another load.
 */
export async function checkForDuplicateBrokerReference(args: {
  reference: string | null | undefined;
  brokerId: string | null | undefined;
  extractedBrokerName?: string | null;
  excludeLoadId?: string | null;
}): Promise<DuplicateMatch[]> {
  const ref = (args.reference ?? '').trim();
  if (!ref) return [];

  const candidates = await fetchDuplicateCandidates(ref, args.excludeLoadId);
  if (candidates.length === 0) return [];

  const brokerIdsFromName = args.brokerId
    ? []
    : await brokerIdsMatchingName(args.extractedBrokerName).catch(() => []);

  return findDuplicateMatches({
    reference: ref,
    brokerId: args.brokerId,
    brokerIdsFromName,
    candidates,
  });
}

/** Writes the paired override entries. Never called unless the dispatcher proceeded. */
export async function recordDuplicateOverride(args: {
  newLoadId: string;
  existingLoadId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_duplicate_broker_reference', {
    p_new_load_id: args.newLoadId,
    p_existing_load_id: args.existingLoadId,
    p_reason: args.reason.trim(),
  });
  if (error) throw error;
}
