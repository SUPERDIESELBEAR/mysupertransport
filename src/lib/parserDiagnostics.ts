import { supabase } from '@/integrations/supabase/client';
import { takeAnchorMisses } from '@/lib/verbatimRegions';
import type { ClassifyResult } from '@/lib/referenceClasses';

/**
 * Durable record of everything the rate-confirmation parser failed to recognise.
 *
 * The anchor miss log used to be an in-memory array that nothing read and that
 * a page reload erased. Its whole purpose is the opposite: to reveal that a
 * broker prints a heading the anchor set does not know, so the anchor set can
 * grow. Same for a reference label the class map has never been taught.
 *
 * Only LABELS and HEADINGS are stored, never reference values. This log must
 * not become a second copy of broker-authored identifiers.
 */

export type ParserDiagnosticKind =
  | 'anchor_miss'
  | 'reference_label_unrecognized'
  | 'reference_row_dropped';

export interface DiagnosticContext {
  loadId?: string | null;
  loadNumber?: string | null;
  documentId?: string | null;
  /** File name when the document has not been filed yet. */
  documentLabel?: string | null;
  parserContract?: number | null;
}

interface DiagnosticRow {
  kind: ParserDiagnosticKind;
  field?: string | null;
  failure?: string | null;
  occurrences?: number;
  stop_number?: number | null;
  headings?: string[];
  ordering?: unknown;
  label?: string | null;
  reference_class?: string | null;
}

/**
 * Builds the rows for a parse. Pure, so the wiring can be asserted without a
 * database: the collection logic and the write are deliberately separable.
 */
export function collectParserDiagnostics(args: {
  anchorMisses: ReturnType<typeof takeAnchorMisses>;
  classified?: Pick<ClassifyResult, 'unrecognized' | 'dropped'> | null;
}): DiagnosticRow[] {
  const rows: DiagnosticRow[] = [];

  args.anchorMisses.forEach(m => {
    rows.push({
      kind: 'anchor_miss',
      field: m.field,
      failure: m.failure,
      occurrences: m.occurrences,
      stop_number: m.stopNumber,
      headings: m.headings ?? [],
      ordering: m.ordering ?? null,
    });
  });

  (args.classified?.unrecognized ?? []).forEach(u => {
    rows.push({
      kind: 'reference_label_unrecognized',
      label: u.label,
      reference_class: 'unclassified',
      stop_number: u.stopSequence,
    });
  });

  (args.classified?.dropped ?? []).forEach(d => {
    rows.push({
      kind: 'reference_row_dropped',
      // The label only. The dropped row's VALUE is never logged.
      label: d.label || null,
      reference_class: d.clazz,
    });
  });

  return rows;
}

/**
 * @parser-check
 * Drains the anchor miss buffer and files it, with the reference-label misses
 * from the same parse, against the load and document they came from.
 *
 * Never throws: a diagnostic that interrupts a parse is worse than a diagnostic
 * that is lost, so a failure here is swallowed after a console warning.
 */
export async function logParserDiagnostics(
  classified: Pick<ClassifyResult, 'unrecognized' | 'dropped'> | null | undefined,
  ctx: DiagnosticContext = {},
): Promise<number> {
  try {
    const rows = collectParserDiagnostics({
      anchorMisses: takeAnchorMisses(),
      classified: classified ?? null,
    });
    if (!rows.length) return 0;

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    if (!uid) return 0;

    const payload = rows.map(r => ({
      ...r,
      load_id: ctx.loadId ?? null,
      load_number: ctx.loadNumber ?? null,
      document_id: ctx.documentId ?? null,
      document_label: ctx.documentLabel ?? null,
      parser_contract: ctx.parserContract ?? null,
      created_by: uid,
    }));

    const { error } = await supabase.from('parser_diagnostics').insert(payload);
    if (error) throw error;
    return payload.length;
  } catch (err) {
    console.warn('[parser-diagnostics] could not record diagnostics', err);
    return 0;
  }
}

export interface ParserDiagnosticRecord {
  id: string;
  kind: ParserDiagnosticKind;
  field: string | null;
  failure: string | null;
  occurrences: number;
  stop_number: number | null;
  headings: string[];
  label: string | null;
  reference_class: string | null;
  load_id: string | null;
  load_number: string | null;
  document_label: string | null;
  parser_contract: number | null;
  resolved_at: string | null;
  created_at: string;
}

export async function fetchParserDiagnostics(
  opts: { includeResolved?: boolean } = {},
): Promise<ParserDiagnosticRecord[]> {
  let q = supabase
    .from('parser_diagnostics')
    .select('id, kind, field, failure, occurrences, stop_number, headings, label, reference_class, load_id, load_number, document_label, parser_contract, resolved_at, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (!opts.includeResolved) q = q.is('resolved_at', null);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ({
    ...r,
    headings: (r.headings ?? []) as string[],
    occurrences: (r.occurrences ?? 0) as number,
  })) as ParserDiagnosticRecord[];
}

/** Marks a miss as taught, so it stops showing as open. */
export async function resolveParserDiagnostic(id: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('parser_diagnostics')
    .update({ resolved_at: new Date().toISOString(), resolved_by: auth?.user?.id ?? null })
    .eq('id', id);
  if (error) throw error;
}

export const DIAGNOSTIC_KIND_LABELS: Record<ParserDiagnosticKind, string> = {
  anchor_miss: 'Unrecognised heading',
  reference_label_unrecognized: 'Unrecognised reference label',
  reference_row_dropped: 'Reference row dropped',
};

export const REGION_FAILURE_LABELS: Record<string, string> = {
  no_anchor: 'No heading on the page matched the anchor set',
  ambiguous: 'Several headings matched — the region could not be chosen',
  empty_region: 'The heading matched but the block below it was empty',
  comment_precedes_heading: 'The comment was printed above its stop heading',
  no_text_layer: 'The document has no usable text layer',
};
