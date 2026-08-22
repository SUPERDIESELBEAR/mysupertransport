import { supabase } from '@/integrations/supabase/client';
import { referenceValueKey } from '@/lib/referenceClasses';
import type { ReferenceFormValues } from '@/pages/dispatch/loadFormSchema';

/**
 * Persistence for `load_references` and `load_reference_citations`.
 *
 * Kept out of the save RPCs on purpose: a citation points at a `load_stops`
 * row, and stop ids only exist after the RPC has run. The RPC returns the load
 * id, this reads the stops back by sequence, then writes the reference rows.
 *
 * An empty array is a NO-OP, not a wipe. Editing a load through the load form
 * does not carry references, and a save from that form must not delete what the
 * rate confirmation established.
 */

export interface StoredReference {
  id: string;
  reference_class: string;
  label: string;
  value: string;
  value_key: string;
  citations: number[];
}

export async function saveLoadReferences(
  loadId: string,
  refs: ReferenceFormValues[],
  opts: { source?: string } = {},
): Promise<void> {
  if (!refs.length) return;
  const source = opts.source ?? 'rate_confirmation';

  const { data: stopRows, error: stopErr } = await supabase
    .from('load_stops')
    .select('id, stop_sequence')
    .eq('load_id', loadId);
  if (stopErr) throw stopErr;
  const stopIdBySeq = new Map<number, string>(
    (stopRows ?? []).map(r => [r.stop_sequence as number, r.id as string]),
  );

  const rows = refs
    .filter(r => (r.value ?? '').trim())
    .map(r => ({
      load_id: loadId,
      reference_class: r.reference_class,
      label: r.label || r.reference_class,
      value: r.value.trim(),
      value_key: referenceValueKey(r.value),
      source,
    }));
  if (!rows.length) return;

  const { data: saved, error } = await supabase
    .from('load_references')
    .upsert(rows, { onConflict: 'load_id,reference_class,value_key' })
    .select('id, reference_class, value_key');
  if (error) throw error;

  const idByKey = new Map<string, string>(
    (saved ?? []).map(r => [`${r.reference_class}:${r.value_key}`, r.id as string]),
  );

  const citations = refs.flatMap(r => {
    const refId = idByKey.get(`${r.reference_class}:${referenceValueKey(r.value)}`);
    if (!refId) return [];
    return (r.citations ?? []).map(seq => ({
      reference_id: refId,
      load_stop_id: stopIdBySeq.get(seq) ?? null,
      stop_sequence: seq,
      printed_label: r.label || null,
    }));
  });

  if (citations.length) {
    // Citations are rewritten wholesale for the references being saved: the
    // document is the authority on where a number is printed.
    const refIds = [...new Set(citations.map(c => c.reference_id))];
    const { error: delErr } = await supabase
      .from('load_reference_citations')
      .delete()
      .in('reference_id', refIds);
    if (delErr) throw delErr;
    const { error: insErr } = await supabase
      .from('load_reference_citations')
      .insert(citations);
    if (insErr) throw insErr;
  }
}

/** Reads a load's references with their stop citations, for display and diffing. */
export async function fetchLoadReferences(loadId: string): Promise<StoredReference[]> {
  const { data, error } = await supabase
    .from('load_references')
    .select('id, reference_class, label, value, value_key, load_reference_citations(stop_sequence)')
    .eq('load_id', loadId)
    .order('reference_class');
  if (error) throw error;

  return (data ?? []).map(r => ({
    id: r.id as string,
    reference_class: r.reference_class as string,
    label: r.label as string,
    value: r.value as string,
    value_key: r.value_key as string,
    citations: ((r.load_reference_citations ?? []) as { stop_sequence: number | null }[])
      .map(c => c.stop_sequence)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b),
  }));
}
