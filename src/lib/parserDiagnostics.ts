import { supabase } from '@/integrations/supabase/client';
import { takeAnchorMisses } from '@/lib/verbatimRegions';
import type { ClassifyResult } from '@/lib/referenceClasses';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { getDbErrorParts, logDbError, type DbErrorShape } from '@/lib/dbError';

/** Structured Postgres error parts, all keys present. */
export type DbErrorParts = Required<DbErrorShape>;

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
  ordering?: Record<string, unknown> | null;
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
      ordering: (m.ordering ?? null) as unknown as Record<string, unknown> | null,
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

/** What a diagnostics write actually did, so the panel can tell the truth. */
export interface DiagnosticWriteResult {
  /** Rows the resolver produced for this parse. */
  collected: number;
  /** Rows the insert confirmed. */
  written: number;
  /**
   * Why the rest did not land, when they did not — the structured Postgres
   * parts, not a flattened sentence. The code is what identifies the class of
   * failure, so it must survive to the screen.
   */
  error: DbErrorParts | null;
}

/**
 * The key set every payload row must expose.
 *
 * PostgREST rejects a bulk insert whose objects have differing keys
 * (PGRST102, "All object keys must match"). A parse that produced only anchor
 * misses (headings, occurrences) inserted fine; a parse that also produced a
 * dropped reference row (label, reference_class) failed as a batch and wrote
 * nothing. A fix in one area silently disabled a diagnostic in another.
 */
const FULL_ROW_KEYS = [
  'kind', 'field', 'failure', 'occurrences', 'stop_number',
  'headings', 'ordering', 'label', 'reference_class',
] as const;

/** The key set a payload row must expose, for the wiring guard. */
export const diagnosticRowKeys = (): readonly string[] => FULL_ROW_KEYS;

/** Widens every row to the full key set so a mixed batch is still one shape. */
export function normalizeDiagnosticRows(
  rows: DiagnosticRow[],
  ctx: DiagnosticContext = {},
): Record<string, unknown>[] {
  return rows.map(r => ({
    kind: r.kind,
    field: r.field ?? null,
    failure: r.failure ?? null,
    occurrences: r.occurrences ?? 0,
    stop_number: r.stop_number ?? null,
    headings: r.headings ?? [],
    ordering: (r.ordering ?? null) as Json,
    label: r.label ?? null,
    reference_class: r.reference_class ?? null,
    load_id: ctx.loadId ?? null,
    load_number: ctx.loadNumber ?? null,
    document_id: ctx.documentId ?? null,
    document_label: ctx.documentLabel ?? null,
    parser_contract: ctx.parserContract ?? null,
    // No actor from the client: the column defaults to current_profile_id(),
    // which is a profiles(id) — an auth uid here is the wrong uuid entirely.
  }));
}

/**
 * @parser-check
 * Drains the anchor miss buffer and files it, with the reference-label misses
 * from the same parse, against the load and document they came from.
 *
 * Never throws: a diagnostic that interrupts a parse is worse than a diagnostic
 * that is lost. It never reports success it did not have either — the caller
 * gets the collected count and the written count separately, because a write
 * that reports nothing is otherwise indistinguishable from a clean parse.
 */
export async function logParserDiagnostics(
  classified: Pick<ClassifyResult, 'unrecognized' | 'dropped'> | null | undefined,
  ctx: DiagnosticContext = {},
): Promise<DiagnosticWriteResult> {
  let collected = 0;
  try {
    const rows = collectParserDiagnostics({
      anchorMisses: takeAnchorMisses(),
      classified: classified ?? null,
    });
    collected = rows.length;
    if (!rows.length) return { collected: 0, written: 0, error: null };

    const payload = normalizeDiagnosticRows(rows, ctx);
    const { data, error } = await supabase
      .from('parser_diagnostics')
      .insert(payload as never)
      .select('id');
    if (error) throw error;
    return { collected, written: data?.length ?? 0, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[parser-diagnostics] could not record diagnostics', err);
    toast({
      variant: 'destructive',
      title: 'Parser diagnostics could not be recorded',
      description:
        `${collected} unrecognised item${collected === 1 ? '' : 's'} from this parse were not saved: ` +
        `${message}. The parse itself is unaffected.`,
      // A logging failure that scrolls away is the failure repeating itself.
      duration: Number.POSITIVE_INFINITY,
    });
    return { collected, written: 0, error: message };
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
  // Server-side RPC so `resolved_by` is the resolver's profile id.
  const { error } = await supabase.rpc('resolve_parser_diagnostic', { p_id: id });
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
