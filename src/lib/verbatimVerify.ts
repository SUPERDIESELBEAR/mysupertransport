/**
 * Verbatim verification: does the model's transcription of a broker-authored
 * text block actually appear on the page?
 *
 * Exact containment does not work on real rate confirmations. The Blue Grace
 * tender is representative: the PDF text layer renders `53' 102"` as a pilcrow
 * plus control characters, and `OS&D` as a runaway entity chain
 * (`OS&amp;amp;amp;...D`). A containment check would report a faithful
 * transcription as missing, every time.
 *
 * So the comparator does three things:
 *   1. Normalizes both sides for *layer damage only* — entity chains collapsed,
 *      control characters and stray pilcrows dropped, whitespace collapsed.
 *      Casing and punctuation are NOT collapsed: a model that re-cases or
 *      re-punctuates broker terms has not transcribed them verbatim.
 *   2. Scores Dice bigram similarity of the transcription against the best
 *      matching window of the layer. Measured on this document: a faithful
 *      transcription scores 0.995; the same text with one phone number deleted
 *      scores 0.987. The threshold sits at 0.99 for that reason.
 *   3. Independently checks that high-signal tokens present in the layer window
 *      — emails, phone numbers, dollar amounts, long digit runs — survived into
 *      the transcription. This is what catches lossy paraphrase that still
 *      scores well, which is the failure mode observed on this document.
 *
 * The two failure verdicts are deliberately distinct:
 *   - `unverified`      the model's output does not match the page (model issue)
 *   - `layer_unreliable` the page's own text layer is too damaged to judge
 *                        (document issue — do not blame the transcription)
 */

export type VerbatimVerdict =
  | 'verified'
  | 'unverified'
  | 'layer_unreliable'
  | 'no_layer';

export interface VerbatimVerification {
  /** Field this verdict is about, e.g. `special_instructions_verbatim`. */
  field: string;
  verdict: VerbatimVerdict;
  /** Dice bigram similarity against the best window of the text layer, 0..1. */
  similarity: number;
  /** High-signal tokens found on the page but absent from the transcription. */
  missingTokens: string[];
  /** Share of the compared layer window that was damaged glyphs / entity noise. */
  layerDegradation: number;
}

export const VERBATIM_SIMILARITY_THRESHOLD = 0.99;
/** Above this share of damaged characters the layer cannot arbitrate a near miss. */
export const LAYER_DEGRADATION_LIMIT = 0.02;

/* ------------------------------------------------------------------ */
/* Normalization                                                        */
/* ------------------------------------------------------------------ */

/** `&amp;amp;amp;D` -> `&D`. Collapses a repeated-escape chain to one entity. */
const ENTITY_CHAIN = /&(?:amp;)+/gi;
/** Control characters and stray pilcrows the extractor emits for glyph runs. */
// eslint-disable-next-line no-control-regex
const DAMAGED_GLYPHS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00B6]/g;

export interface NormalizedText {
  text: string;
  /** Characters removed as damage, over the original length. */
  degradation: number;
}

/**
 * Repairs layer damage without touching anything a human would read as content.
 * Casing, punctuation and word order are preserved on purpose.
 */
export function normalizeForVerbatim(raw: string): NormalizedText {
  const source = raw ?? '';
  if (!source) return { text: '', degradation: 0 };

  let damaged = 0;
  let out = source.replace(ENTITY_CHAIN, (m) => {
    damaged += m.length - 1;
    return '&';
  });
  out = out.replace(DAMAGED_GLYPHS, (m) => {
    damaged += m.length;
    return ' ';
  });
  // Typographic quotes are a rendering choice, not content.
  out = out.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"');
  out = out.replace(/[\u2010-\u2015]/g, '-');
  out = out.replace(/\s+/g, ' ').trim();

  return { text: out, degradation: source.length ? damaged / source.length : 0 };
}

/* ------------------------------------------------------------------ */
/* Similarity                                                           */
/* ------------------------------------------------------------------ */

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice coefficient over character bigrams. */
export function diceSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  let total = 0;
  A.forEach((count, g) => {
    total += count;
    overlap += Math.min(count, B.get(g) ?? 0);
  });
  B.forEach((count) => { total += count; });
  return total ? (2 * overlap) / total : 0;
}

/**
 * The layer is the whole document; the transcription is one block of it. Slide a
 * window the length of the transcription across the layer and keep the best
 * score. Coarse stride first, then a fine pass around the winner — a linear scan
 * at stride 1 over a two-page layer is wasteful and buys nothing.
 */
export function bestWindow(layer: string, needle: string): { score: number; window: string } {
  if (!layer || !needle) return { score: 0, window: '' };
  if (needle.length >= layer.length) {
    return { score: diceSimilarity(layer, needle), window: layer };
  }

  const width = needle.length;
  const scan = (from: number, to: number, stride: number) => {
    let best = { score: -1, window: '', at: 0 };
    for (let i = Math.max(0, from); i <= Math.min(to, layer.length - width); i += stride) {
      const w = layer.slice(i, i + width);
      const s = diceSimilarity(w, needle);
      if (s > best.score) best = { score: s, window: w, at: i };
    }
    return best;
  };

  const coarse = scan(0, layer.length - width, Math.max(1, Math.floor(width / 8)));
  const fine = scan(coarse.at - width, coarse.at + width, 1);
  const winner = fine.score >= coarse.score ? fine : coarse;
  return { score: Math.max(0, winner.score), window: winner.window };
}

/* ------------------------------------------------------------------ */
/* High-signal tokens                                                   */
/* ------------------------------------------------------------------ */

const TOKEN_PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,            // email
  /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,                // phone
  /\$\s?\d[\d,]*(?:\.\d{2})?/g,                          // money
  /\b\d{5,}\b/g,                                         // long digit runs (refs)
];

const tokenKey = (t: string) => t.replace(/[^A-Za-z0-9@.]/g, '').toUpperCase();

export function extractSignalTokens(s: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  TOKEN_PATTERNS.forEach((re) => {
    const rx = new RegExp(re.source, re.flags);
    let m = rx.exec(s);
    while (m) {
      const key = tokenKey(m[0]);
      if (key.length >= 5 && !seen.has(key)) {
        seen.add(key);
        found.push(m[0].trim());
      }
      m = rx.exec(s);
    }
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* Verdict                                                              */
/* ------------------------------------------------------------------ */

export interface VerifyOptions {
  threshold?: number;
  degradationLimit?: number;
}

/**
 * Damage rate of the raw lines that fed the matched window. A block rendered
 * through mangled glyphs is a document problem; averaging it over two pages of
 * clean text would report it as a transcription problem instead.
 */
export function localDamage(rawLayer: string, normalizedWindow: string): number {
  if (!normalizedWindow) return 0;
  let damaged = 0;
  let kept = 0;
  rawLayer.split('\n').forEach((line) => {
    const n = normalizeForVerbatim(line);
    if (!n.text) return;
    // A line counts as part of the window if a decent run of it appears there.
    const probe = n.text.slice(0, Math.min(24, n.text.length));
    if (probe.length >= 8 && !normalizedWindow.includes(probe)) return;
    if (probe.length < 8 && !normalizedWindow.includes(n.text)) return;
    damaged += n.degradation * line.length;
    kept += line.length;
  });
  return kept ? damaged / kept : 0;
}

/**
 * @param field       name reported back with the verdict
 * @param transcribed the model's verbatim capture
 * @param layer       the raw PDF text layer for the whole document
 */
export function verifyVerbatim(
  field: string,
  transcribed: string | null | undefined,
  layer: string | null | undefined,
  opts: VerifyOptions = {},
): VerbatimVerification {
  const threshold = opts.threshold ?? VERBATIM_SIMILARITY_THRESHOLD;
  const degradationLimit = opts.degradationLimit ?? LAYER_DEGRADATION_LIMIT;

  const value = (transcribed ?? '').trim();
  if (!value) {
    return { field, verdict: 'verified', similarity: 1, missingTokens: [], layerDegradation: 0 };
  }
  if (!layer || !layer.trim()) {
    return { field, verdict: 'no_layer', similarity: 0, missingTokens: [], layerDegradation: 1 };
  }

  const normLayer = normalizeForVerbatim(layer);
  const normValue = normalizeForVerbatim(value);
  const { score, window } = bestWindow(normLayer.text, normValue.text);

  // `window` is already normalized, so re-normalizing it reports zero damage.
  // Measure damage on the raw source lines the window actually came from —
  // a two-page layer's average hides a block that is locally mangled.
  const windowDamage = localDamage(layer, window);
  const degradation = Math.max(windowDamage, normLayer.degradation);


  // Tokens the page prints inside the matched window must survive transcription.
  const have = new Set(extractSignalTokens(normValue.text).map(tokenKey));
  const missingTokens = extractSignalTokens(window)
    .filter((t) => !have.has(tokenKey(t)));

  if (score >= threshold && missingTokens.length === 0) {
    return { field, verdict: 'verified', similarity: score, missingTokens, layerDegradation: degradation };
  }

  // A near miss on a visibly damaged layer, with every signal token intact, is
  // the document's fault rather than the model's.
  if (missingTokens.length === 0 && degradation > degradationLimit && score >= threshold - 0.05) {
    return { field, verdict: 'layer_unreliable', similarity: score, missingTokens, layerDegradation: degradation };
  }

  return { field, verdict: 'unverified', similarity: score, missingTokens, layerDegradation: degradation };
}
