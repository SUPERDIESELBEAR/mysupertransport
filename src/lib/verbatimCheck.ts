import { pageForLine, textLayerFor, type PdfTextLayer } from '@/lib/pdfTextLayer';
import { damageFingerprint, verifyVerbatim, type VerbatimVerification } from '@/lib/verbatimVerify';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { documentHeadings } from '@/lib/verbatimRegions';
import {
  adoptVerbatim,
  type TruncationSignal,
  type VerbatimOrigin,
  type VerbatimOriginReason,
} from '@/lib/verbatimAdopt';

/**
 * Runs the verbatim check in the browser, where the PDF's own text layer is
 * available. The edge function only ever sees the document, so it cannot check
 * its own transcription against the page it transcribed.
 *
 * Shared by the create form and the revision review: a damaged capture has to be
 * caught on both paths, and the revision screen previously ran no check at all.
 */

export interface VerbatimCheck extends VerbatimVerification {
  /** 1-based page the region is printed on, when the layer can place it. */
  page: number | null;
  /** Index into the *parsed* stops for a stop-level capture; null at load level. */
  parsedStopIndex: number | null;
  /** The capture this verdict is about, as it stands (repairs and adoption included). */
  value: string;
  /**
   * Heading-shaped lines the parser saw, carried only when the region failed to
   * resolve. This is the same payload `parser_diagnostics` stores; it rides on
   * the check so the reason is legible without leaving an unsaved parse.
   */
  documentHeadings?: string[] | null;

  /**
   * Where the STORED value came from. Note the distinction from `verdict`, which
   * always judges the MODEL's transcription against the page: a field can read
   * `unverified` and still store the page's own text, and that combination is the
   * point — the score describes the model, the origin describes the load.
   */
  valueOrigin: VerbatimOrigin;
  originReason: VerbatimOriginReason;
  /** The model's transcription, kept even when the layer was stored instead. */
  modelValue: string;
  /** Region length over model length, so a short region is legible after the fact. */
  layerLengthRatio: number | null;
  /** Which sanity checks refused the region, when any did. */
  truncationSignals: TruncationSignal[] | null;
}

export interface VerbatimCheckResult {
  checks: VerbatimCheck[];
  layer: PdfTextLayer | null;
  /**
   * The parse with every adopted capture replaced by the page's own text. The
   * caller must apply THIS to the form and to the diff — the stored value is the
   * adopted one, and a screen fed from the original would show a value the load
   * will not hold.
   */
  adopted: ParsedRateConfirmation;
}

/**
 * @parser-check
 * Judges every verbatim capture in a parsed document against the printed page,
 * and takes the value from the page where the page is clean.
 */
export async function verifyParsedVerbatim(
  f: File, result: ParsedRateConfirmation,
): Promise<VerbatimCheckResult> {
  const layer = await textLayerFor(f).catch(() => null);
  const text = layer?.text ?? '';
  const out: VerbatimCheck[] = [];
  let adopted = structuredClone(result) as ParsedRateConfirmation;

  // The heading-shaped lines are carried on the check itself, so the reason a
  // field did not resolve is readable on the parse screen. It used to be
  // reachable only from the diagnostics page, which meant discarding an unsaved
  // parse to learn why the parse failed.
  const headings = documentHeadings(text);

  /**
   * Verify the model's capture, then decide what to store. Both run for every
   * field: the verdict is about the transcription and stays comparable across
   * documents whether or not the layer was adopted.
   */
  const judge = (
    field: string, modelValue: string, parsedStopIndex: number | null, stopNumber?: number,
  ): VerbatimCheck => {
    const v: VerbatimVerification = verifyVerbatim(field, modelValue, text, { stopNumber });
    const a = adoptVerbatim(field, modelValue, text, { stopNumber });
    if (a.origin === 'text_layer') {
      adopted = withRepairedCapture(
        adopted, { field, parsedStopIndex } as VerbatimCheck, a.value,
      );
    }
    return {
      ...v,
      page: pageForLine(layer, v.regionStartLine),
      parsedStopIndex,
      value: a.value,
      documentHeadings: v.regionFailure ? headings : null,
      valueOrigin: a.origin,
      originReason: a.reason,
      modelValue: a.modelValue,
      layerLengthRatio: a.layerLengthRatio,
      truncationSignals: a.truncationSignals,
    };
  };

  const si = result.verbatim?.special_instructions?.value;
  if (si) out.push(judge('special_instructions_verbatim', si, null));

  const bt = result.verbatim?.broker_terms?.value;
  if (bt) out.push(judge('broker_terms_verbatim', bt, null));

  (result.stops ?? []).forEach((stop, i) => {
    const notes = stop.notes_verbatim?.value;
    if (notes) out.push(judge('stop_notes_verbatim', notes, i, i + 1));
  });

  // Content-free recurrence signal. The artifacts themselves are stored on the
  // load; this line only says how much damage of what kind, so a log never
  // becomes a second copy of broker-authored text.
  out.forEach(v => {
    if (v.transcriptionDamage?.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `verbatim capture damaged — field=${v.field} page=${v.page ?? '?'} ` +
        `${damageFingerprint(v.transcriptionDamage)}`,
      );
    }
  });

  return { checks: out, layer };
}

/**
 * Returns a copy of the parse with one verbatim capture replaced by the
 * dispatcher's reading of the printed page.
 *
 * A copy, not a mutation, so the revision diff recomputes off the repaired
 * value and the screen stops offering the corrupted one.
 */
export function withRepairedCapture(
  result: ParsedRateConfirmation, check: VerbatimCheck, text: string,
): ParsedRateConfirmation {
  const next = structuredClone(result) as ParsedRateConfirmation;
  if (check.parsedStopIndex === null) {
    const key = check.field === 'broker_terms_verbatim' ? 'broker_terms' : 'special_instructions';
    const slot = next.verbatim?.[key];
    if (slot) slot.value = text;
  } else {
    const slot = next.stops?.[check.parsedStopIndex]?.notes_verbatim;
    if (slot) slot.value = text;
  }
  return next;
}
