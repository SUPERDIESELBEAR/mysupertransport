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

export interface StoredCitation {
  stopSequence: number;
  printedLabel: string;
}

export interface StoredReference {
  id: string;
  reference_class: string;
  label: string;
  value: string;
  value_key: string;
  citations: StoredCitation[];
}


/** Shape the `file_load_references` RPC expects for one reference row. */
function toRpcRef(r: ReferenceFormValues) {
  return {
    reference_class: r.reference_class,
    label: r.label || r.reference_class,
    value: r.value.trim(),
    value_key: referenceValueKey(r.value),
    citations: (r.citations ?? []).map(c => ({
      stopSequence: c.stopSequence,
      // The label as THAT stop printed it — `PU#`, not the row's
      // `Pickup Number`. Substituting the row label erases the difference the
      // citation exists to record.
      printedLabel: (c.printedLabel ?? '').trim() || r.label || r.reference_class,
    })),
  };
}

/**
 * @parser-check
 * Stores the document's reference numbers on the load.
 *
 * One RPC, not three round trips. Stop lookup, the reference rows, their
 * citations and (for a baseline) the history entry all happen inside a single
 * database transaction, and the actor is resolved there with
 * `current_profile_id()` — `created_by` / `changed_by` are foreign keys to
 * `profiles(id)`, and an auth uid sent from the client raises 23503.
 */
export async function saveLoadReferences(
  loadId: string,
  refs: ReferenceFormValues[],
  opts: {
    source?: string;
    /**
     * References the dispatcher confirmed the revised document no longer
     * prints. Absence from `refs` does NOT delete a row — an empty array is a
     * no-op here by design — so a removal has to be stated.
     */
    removals?: { reference_class: string; label: string; value: string; value_key: string }[];
    /**
     * Class moves applied IN PLACE, before the upsert runs. The upsert key is
     * (load_id, reference_class, value_key): writing the new class straight
     * through would miss the stored row entirely and insert a second one, which
     * is exactly the duplicate this path exists to prevent. Updating first means
     * the upsert then matches, so the row id, its citations and its created_at
     * all survive.
     */
    reclassifications?: { from_reference_class: string; to_reference_class: string; value_key: string }[];
  } = {},
): Promise<void> {
  const usable = refs.filter(r => (r.value ?? '').trim());
  const removals = (opts.removals ?? []).filter(r => (r.value_key ?? '').trim());
  const reclass = (opts.reclassifications ?? []).filter(
    r => r.value_key && r.from_reference_class && r.to_reference_class
      && r.from_reference_class !== r.to_reference_class,
  );

  for (const r of reclass) {
    const { error } = await supabase
      .from('load_references')
      .update({ reference_class: r.to_reference_class })
      .eq('load_id', loadId)
      .eq('value_key', r.value_key)
      .eq('reference_class', r.from_reference_class);
    if (error) throw error;
  }

  if (!usable.length && !removals.length) return;

  const { error } = await supabase.rpc('file_load_references', {
    p_load_id: loadId,
    p_refs: usable.map(toRpcRef) as never,
    p_source: opts.source ?? 'rate_confirmation',
    p_removals: removals as never,
  });
  if (error) throw error;
}



/** Reads a load's references with their stop citations, for display and diffing. */
export async function fetchLoadReferences(loadId: string): Promise<StoredReference[]> {
  const { data, error } = await supabase
    .from('load_references')
    .select('id, reference_class, label, value, value_key, load_reference_citations(stop_sequence, printed_label)')
    .eq('load_id', loadId)
    .order('reference_class');
  if (error) throw error;

  return (data ?? []).map(r => ({
    id: r.id as string,
    reference_class: r.reference_class as string,
    label: r.label as string,
    value: r.value as string,
    value_key: r.value_key as string,
    citations: ((r.load_reference_citations ?? []) as
      { stop_sequence: number | null; printed_label: string | null }[])
      .filter(c => typeof c.stop_sequence === 'number')
      .map(c => ({
        stopSequence: c.stop_sequence as number,
        printedLabel: c.printed_label ?? (r.label as string),
      }))
      .sort((a, b) => a.stopSequence - b.stopSequence),
  }));

}

/**
 * Files the references a document printed as the load's baseline.
 *
 * Not a revision: the load had no reference rows, and now it has the ones the
 * document shows. The provenance entry records which document established them
 * and who filed it, so a baseline taken from a REVISED rate confirmation rather
 * than the original stays visible in the load's history.
 *
 * References, citations and that history entry go in ONE transaction. Splitting
 * them left ST26034 with five reference rows and no history entry when the
 * history insert failed.
 */
export async function fileReferenceBaseline(args: {
  loadId: string;
  refs: ReferenceFormValues[];
  documentId: string | null;
  documentLabel: string;
}): Promise<void> {
  const usable = args.refs.filter(r => (r.value ?? '').trim());
  if (!usable.length) return;

  const { error } = await supabase.rpc('file_load_references', {
    p_load_id: args.loadId,
    p_refs: usable.map(toRpcRef) as never,
    p_source: 'reference_baseline',
    p_document_id: args.documentId,
    p_document_label: args.documentLabel,
    p_summary: usable.map(r => `${r.label}: ${r.value}`).join('; '),
  });
  if (error) throw error;
}
