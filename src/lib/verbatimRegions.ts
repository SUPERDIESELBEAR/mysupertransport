/**
 * Document-determined regions for verbatim verification.
 *
 * The defect this exists to fix: verification used to slide a window the length
 * of the *transcription* across the whole text layer and score the best-matching
 * slice. That makes the region a property of what the model wrote. A condensed
 * paraphrase of the Special Instructions block selected a cleaner window a page
 * away, in the broker-terms paragraph, and was then judged — damage, similarity
 * and tokens alike — against text it does not correspond to. Its failure verdict
 * was accidental rather than earned, and the two tokens it actually dropped were
 * never demanded because they were not in the window that got scored.
 *
 * So the region is cut from the document instead: find the printed heading the
 * field corresponds to, take the block it owns, and judge the transcription
 * against that fixed region. Damage then becomes one figure per field per
 * document, independent of the transcription, which is what it always should
 * have been.
 *
 * Stop-level fields are cut from the printed `Stop N` headings, never from an
 * occurrence index across the layer. Blue Grace prints a load-level `Comments`
 * heading above the stops and a `Comments:` line inside each one; counting
 * occurrences would shift every stop by one and verify each stop's notes against
 * its neighbour's text. That failure would be silent — the regions resolve, the
 * numbers compute, and they are all wrong by one.
 */

export type VerbatimField =
  | 'special_instructions_verbatim'
  | 'broker_terms_verbatim'
  | 'stop_notes_verbatim';

export type RegionFailure =
  | 'anchor_not_found'
  | 'anchor_ambiguous'
  | 'stop_not_found'
  | 'empty_region'
  /**
   * The layer emits a stop's comment line outside the slice its printed heading
   * owns, so no stop slice on this document can be trusted. Distinct from
   * `anchor_not_found` on purpose: the anchor is there, the ordering is not.
   */
  | 'comment_precedes_heading';

export interface FieldRegion {
  field: VerbatimField;
  /** Which printed anchor matched, for the report and for growing the anchor set. */
  anchorId: string;
  /** Inclusive line indices into the layer. */
  startLine: number;
  endLine: number;
  /** Raw lines exactly as the layer yields them — damage is measured on these. */
  rawLines: string[];
  /** Those lines joined; the text the transcription is judged against. */
  text: string;
}

export interface RegionResult {
  /** The resolved region, or null when the document did not yield one. */
  region: FieldRegion | null;
  failure: RegionFailure | null;
  occurrences: number;
  anchorId: string | null;
}

const miss = (failure: RegionFailure, occurrences = 0, anchorId: string | null = null): RegionResult =>
  ({ region: null, failure, occurrences, anchorId });

interface Anchor {
  id: string;
  /** Matches at line start. Group 1, when present, is inline body on the same line. */
  re: RegExp;
  /**
   * Colon-required anchors distinguish a labelled line (`Comments: PU# 1234`)
   * from a bare section heading (`Comments`). Blue Grace prints both.
   */
  inlineOnly?: boolean;
}

/**
 * Only the Blue Grace forms are sighted on a real document. The rest are common
 * synonyms, and every miss is logged so the set grows from tenders we actually
 * receive rather than from guesses.
 */
const FIELD_ANCHORS: Record<VerbatimField, Anchor[]> = {
  special_instructions_verbatim: [
    { id: 'special_instructions', re: /^\s*special\s+instructions\s*:?\s*(.*)$/i },
    { id: 'driver_instructions', re: /^\s*driver\s+instructions\s*:?\s*(.*)$/i },
    { id: 'carrier_instructions', re: /^\s*carrier\s+instructions\s*:?\s*(.*)$/i },
    { id: 'load_instructions', re: /^\s*load\s+instructions\s*:?\s*(.*)$/i },
    { id: 'shipment_instructions', re: /^\s*shipment\s+instructions\s*:?\s*(.*)$/i },
    { id: 'notes_to_carrier', re: /^\s*notes\s+to\s+carrier\s*:?\s*(.*)$/i },
    { id: 'dispatch_notes', re: /^\s*dispatch\s+notes\s*:?\s*(.*)$/i },
  ],
  broker_terms_verbatim: [
    // `BlueGrace Logistics (BGLF) will only consider additional charges if …`
    { id: 'terms_paragraph_opener', re: /^\s*([A-Za-z][\w .,'&-]{0,40}\(\s*[A-Z]{2,6}\s*\)\s+will\b.*)$/ },
    { id: 'terms_and_conditions', re: /^\s*terms\s+and\s+conditions\s*:?\s*(.*)$/i },
    { id: 'broker_carrier_agreement', re: /^\s*broker[\s-]?carrier\s+agreement\s*:?\s*(.*)$/i },
  ],
  stop_notes_verbatim: [
    { id: 'stop_comments', re: /^\s*comments\s*:\s*(.*)$/i, inlineOnly: true },
    { id: 'stop_notes', re: /^\s*stop\s+notes\s*:\s*(.*)$/i, inlineOnly: true },
    { id: 'stop_instructions', re: /^\s*stop\s+instructions\s*:\s*(.*)$/i, inlineOnly: true },
  ],
};

/**
 * A printed heading that ends whatever block preceded it.
 *
 * Blank lines cannot be the only boundary: `pdftotext` separates blocks with
 * them, the browser's pdf.js worker does not. On the same document the browser
 * layer ran the Special Instructions block four lines into the first stop's
 * appointment window and address, which pulled a stray ZIP into the demanded
 * tokens and dropped the damage figure by a point. The boundary has to be a
 * printed structure both extractors emit.
 */
const TERMINATORS: RegExp[] = [
  /^\s*references\s*$/i,
  /^\s*freight\s+terms/i,
  /^\s*items\s*$/i,
  /^\s*charge\s+details\s*$/i,
  /^\s*equipment\s*&\s*services/i,
  /^\s*stop\s+\d+\b/i,
  /^\s*page\s+\d+\s*\/\s*\d+\s*$/i,
  /^\s*comments\s*$/i,
  /^\s*comments\s*:/i,
  /^\s*contact\s+information\s*:/i,
  /^\s*special\s+instructions\s*$/i,
  /^\s*bill\s+to\s*:/i,
  // Appointment window line that opens a stop block: `06/18/2025 08:00AM - …`
  /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M\b/i,
];

const STOP_HEADING = /^\s*stop\s+(\d+)\b/i;
/** A labelled stop-comment line, in any of the forms the stop anchors accept. */
const STOP_COMMENT_LINE = /^\s*(?:comments|stop\s+notes|stop\s+instructions)\s*:\s*\S/i;
const MAX_REGION_LINES = 40;

const isBlank = (l: string) => !l.trim();
const isTerminator = (l: string) => TERMINATORS.some((re) => re.test(l));

/**
 * The line range each printed `Stop N` heading owns: the heading through the
 * line before the next stop heading (or the end of the document).
 */
export function stopSlices(layer: string): Map<number, { start: number; end: number }> {
  const lines = layer.split('\n');
  const heads: { n: number; at: number }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(STOP_HEADING);
    if (m) heads.push({ n: Number(m[1]), at: i });
  });

  const out = new Map<number, { start: number; end: number }>();
  heads.forEach((h, idx) => {
    // A repeated stop number keeps its first slice rather than silently
    // overwriting it — two Stop 2 headings is a document to look at, not a
    // reason to pick the later one.
    if (out.has(h.n)) return;
    const end = idx + 1 < heads.length ? heads[idx + 1].at - 1 : lines.length - 1;
    out.set(h.n, { start: h.at, end });
  });
  return out;
}

export interface StopOrdering {
  /** Line index of every printed `Stop N` heading, with its number. */
  headings: { stop: number; line: number }[];
  /** Line index of every labelled stop-comment line. */
  comments: number[];
  /** Comment lines emitted before the first stop heading. */
  orphanComments: number[];
}

/**
 * What the layer says about stop ordering. Read from the whole layer, never
 * from a slice — a slice cannot see the line that fell outside it.
 */
export function stopOrdering(layer: string): StopOrdering {
  const lines = layer.split('\n');
  const headings: { stop: number; line: number }[] = [];
  const comments: number[] = [];
  lines.forEach((l, i) => {
    const m = l.match(STOP_HEADING);
    if (m) headings.push({ stop: Number(m[1]), line: i });
    else if (STOP_COMMENT_LINE.test(l)) comments.push(i);
  });
  const first = headings.length ? headings[0].line : Number.POSITIVE_INFINITY;
  return { headings, comments, orphanComments: comments.filter((c) => c < first) };
}

/**
 * True when stop slices cannot be trusted on this document.
 *
 * pdf.js emits Blue Grace's first `Comments:` line *above* its `Stop 1 (pickup)`
 * heading, which leaves slice 1 holding stop 2's comment — a stop verified,
 * confidently, against its neighbour's text. Reconstructing reading order from
 * text-run positions would be extractor-specific and layout-specific, and a
 * subtle error there is worse than this failure because it does not announce
 * itself. So the document is refused instead.
 *
 * The refusal covers EVERY stop, not only the detected one: a layer that
 * misplaces one comment has an ordering none of its slices can be trusted
 * against, and verifying the rest would reintroduce exactly the silent
 * mis-attribution this guards.
 */
export function stopSlicesUntrustworthy(layer: string): boolean {
  const { headings, comments, orphanComments } = stopOrdering(layer);
  if (!headings.length || !comments.length) return false;

  // One comment per stop is the shape these tenders print, so a stop left with
  // none is the tell. A comment above the first heading is not enough on its
  // own: Blue Grace prints a legitimate load-level `Comments:` there while every
  // stop still keeps its own. The shift only shows when an orphan (or a slice
  // holding two) is paired with a slice holding none.
  const slices = [...stopSlices(layer).values()];
  const counts = slices.map((s) => comments.filter((c) => c >= s.start && c <= s.end).length);
  if (!counts.some((n) => n === 0)) return false;
  return orphanComments.length > 0 || counts.some((n) => n > 1);
}

/** Heading-shaped lines, for the miss log: short, non-empty, not sentence prose. */
export function documentHeadings(layer: string): string[] {
  const seen = new Set<string>();
  return layer
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length > 60) return false;
      const heading = /:$/.test(l) || /^[A-Z][A-Za-z0-9 &/#'-]*$/.test(l);
      if (!heading) return false;
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
}

interface Hit {
  anchorId: string;
  line: number;
  inline: string;
}

function findHits(lines: string[], anchors: Anchor[], from: number, to: number): Hit[] {
  const hits: Hit[] = [];
  for (let i = from; i <= to; i += 1) {
    for (const a of anchors) {
      const m = lines[i].match(a.re);
      if (!m) continue;
      const inline = (m[1] ?? '').trim();
      if (a.inlineOnly && !inline) break;
      hits.push({ anchorId: a.id, line: i, inline });
      break;
    }
  }
  return hits;
}

/** Body lines below an anchor, stopping at a blank line after content, a
 *  terminator heading, the end of the searched range, or the 40-line cap. */
function bodyBelow(lines: string[], from: number, to: number): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (let i = from; i <= to && i - from < MAX_REGION_LINES; i += 1) {
    const line = lines[i];
    if (isBlank(line)) {
      if (start >= 0) break;
      continue;
    }
    if (isTerminator(line)) break;
    if (start < 0) start = i;
    end = i;
  }
  return start >= 0 ? { start, end } : null;
}

/**
 * Locate a field's region on the document.
 *
 * @param stopNumber required for `stop_notes_verbatim`; the printed stop number,
 *                   not an index. A stop with no printed heading fails as
 *                   `stop_not_found` rather than falling through to a neighbour.
 */
export function resolveFieldRegion(
  layer: string | null | undefined,
  field: VerbatimField,
  opts: { stopNumber?: number } = {},
): RegionResult {
  const source = layer ?? '';
  if (!source.trim()) return miss('anchor_not_found');

  const lines = source.split('\n');
  let from = 0;
  let to = lines.length - 1;

  if (field === 'stop_notes_verbatim') {
    const n = opts.stopNumber;
    if (stopSlicesUntrustworthy(source)) return miss('comment_precedes_heading');
    const slice = n == null ? undefined : stopSlices(source).get(n);
    if (!slice) return miss('stop_not_found');
    from = slice.start;
    to = slice.end;
  }

  const hits = findHits(lines, FIELD_ANCHORS[field], from, to);
  if (hits.length === 0) {
    return miss('anchor_not_found');
  }

  // Occurrences that carry a body are the ones that could plausibly be the
  // field. More than one and the document is ambiguous: no region, no numbers.
  const bodied = hits.filter((h) => h.inline || bodyBelow(lines, h.line + 1, to));
  if (bodied.length === 0) {
    return miss('empty_region', hits.length, hits[0].anchorId);
  }
  if (bodied.length > 1) {
    return miss('anchor_ambiguous', bodied.length, bodied[0].anchorId);
  }

  const hit = bodied[0];
  // A labelled line (`Comments: PU# 1234`) is part of the field as printed. A
  // bare heading (`Special Instructions`) is not — it labels the block below it.
  const startLine = hit.inline ? hit.line : (bodyBelow(lines, hit.line + 1, to) as { start: number }).start;
  const below = bodyBelow(lines, hit.inline ? hit.line + 1 : startLine, to);
  const endLine = hit.inline ? (below ? below.end : hit.line) : (bodyBelow(lines, startLine, to) as { end: number }).end;

  const rawLines = lines.slice(startLine, endLine + 1);
  const text = rawLines.join('\n');
  if (!text.trim()) {
    return miss('empty_region', 1, hit.anchorId);
  }

  return {
    region: { field, anchorId: hit.anchorId, startLine, endLine, rawLines, text },
    failure: null,
    occurrences: 1,
    anchorId: hit.anchorId,
  };
}

/* ------------------------------------------------------------------ */
/* Miss log                                                             */
/* ------------------------------------------------------------------ */

export interface AnchorMiss {
  field: VerbatimField;
  failure: RegionFailure;
  occurrences: number;
  stopNumber: number | null;
  /** The document's heading-shaped lines, so a new anchor can be read off it. */
  headings: string[];
  /**
   * Observed stop-heading and comment line positions, recorded for
   * `comment_precedes_heading`. This log is the data for deciding later whether
   * a bounded look-back is safe; nothing reads it automatically today.
   */
  ordering: StopOrdering | null;
  at: string;
}

const misses: AnchorMiss[] = [];

/**
 * Anchors only grow from documents that defeated them, so a miss is recorded
 * rather than swallowed — the same pattern the unclassified reference labels use.
 */
export function recordAnchorMiss(
  field: VerbatimField,
  failure: RegionFailure,
  layer: string | null | undefined,
  occurrences = 0,
  stopNumber: number | null = null,
): void {
  misses.push({
    field,
    failure,
    occurrences,
    stopNumber,
    headings: documentHeadings(layer ?? ''),
    ordering: failure === 'comment_precedes_heading' ? stopOrdering(layer ?? '') : null,
    at: new Date().toISOString(),
  });
  if (misses.length > 200) misses.shift();
}

export const anchorMisses = (): AnchorMiss[] => [...misses];
export const clearAnchorMisses = (): void => { misses.length = 0; };
