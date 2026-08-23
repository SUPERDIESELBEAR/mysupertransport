import { pageForLine, textLayerFor, type PdfTextLayer } from '@/lib/pdfTextLayer';
import { damageFingerprint, verifyVerbatim, type VerbatimVerification } from '@/lib/verbatimVerify';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

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
  /** The capture this verdict is about, as it stands (repairs included). */
  value: string;
}

export interface VerbatimCheckResult {
  checks: VerbatimCheck[];
  layer: PdfTextLayer | null;
}

export async function verifyParsedVerbatim(
  f: File, result: ParsedRateConfirmation,
): Promise<VerbatimCheckResult> {
  const layer = await textLayerFor(f).catch(() => null);
  const text = layer?.text ?? '';
  const out: VerbatimCheck[] = [];

  const withPage = (
    v: VerbatimVerification, parsedStopIndex: number | null, value: string,
  ): VerbatimCheck => ({
    ...v,
    page: pageForLine(layer, v.regionStartLine),
    parsedStopIndex,
    value,
  });

  const si = result.verbatim?.special_instructions?.value;
  if (si) out.push(withPage(verifyVerbatim('special_instructions_verbatim', si, text), null, si));

  const bt = result.verbatim?.broker_terms?.value;
  if (bt) out.push(withPage(verifyVerbatim('broker_terms_verbatim', bt, text), null, bt));

  (result.stops ?? []).forEach((stop, i) => {
    const notes = stop.notes_verbatim?.value;
    if (notes) {
      out.push(withPage(
        verifyVerbatim('stop_notes_verbatim', notes, text, { stopNumber: i + 1 }),
        i,
        notes,
      ));
    }
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
