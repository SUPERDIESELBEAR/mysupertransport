// Server-side verbatim verification and adoption for the email-ingest path.
//
// This is the same pipeline the browser runs in src/lib/verbatimCheck.ts,
// driven here against a layer extracted by pdfTextLayerDeno instead of a File.
// Both sides call the same _shared/verbatim primitives, and a permanent test
// (src/lib/__tests__/ingestVerbatimEquivalence.test.ts) asserts the two
// drivers produce identical verdicts, origins and stored values on the same
// document. no_layer on every field is a bug on this path, not a fallback.

import {
  documentHeadings,
  type VerbatimField,
} from './verbatim/verbatimRegions.ts';
import {
  damageFingerprint,
  verifyVerbatim,
  type VerbatimVerification,
} from './verbatim/verbatimVerify.ts';
import { adoptVerbatim } from './verbatim/verbatimAdopt.ts';
import {
  pageForLineDeno,
  type PdfTextLayerResult,
} from './pdfTextLayerDeno.ts';

// The parser result is shaped in _shared/rateConCore.ts and typed client-side
// as ParsedRateConfirmation; the shared layer keeps it structural.
// deno-lint-ignore no-explicit-any
type ParsedResult = any;

export interface IngestVerbatimCheck extends VerbatimVerification {
  /** 1-based page the region is printed on, when the layer can place it. */
  page: number | null;
  /** Index into the *parsed* stops for a stop-level capture; null at load level. */
  parsedStopIndex: number | null;
  /** The capture as it stands after adoption. */
  value: string;
  /** Heading-shaped lines, carried when the region failed to resolve. */
  documentHeadings?: string[] | null;
  valueOrigin: 'text_layer' | 'model';
  originReason: string;
  modelValue: string;
  layerLengthRatio: number | null;
  truncationSignals: string[] | null;
}

export interface IngestVerbatimResult {
  checks: IngestVerbatimCheck[];
  /** The parse with every adopted capture replaced by the page's own text. */
  adopted: ParsedResult;
  /** True when a usable layer existed. False here means every check is no_layer. */
  layerAvailable: boolean;
}

/**
 * Judges every verbatim capture in a parsed document against the printed page,
 * and takes the value from the page where the page is clean.
 */
export function judgeParsedVerbatimServer(
  result: ParsedResult,
  layer: PdfTextLayerResult | null,
): IngestVerbatimResult {
  const text = layer?.text ?? '';
  const out: IngestVerbatimCheck[] = [];
  let adopted = structuredClone(result);

  const headings = documentHeadings(text);

  const judge = (
    field: string, modelValue: string, parsedStopIndex: number | null, stopNumber?: number,
  ): IngestVerbatimCheck => {
    const v: VerbatimVerification = verifyVerbatim(field, modelValue, text, { stopNumber });
    const a = adoptVerbatim(field, modelValue, text, { stopNumber });
    if (a.origin === 'text_layer') {
      adopted = replaceCapture(adopted, field, parsedStopIndex, a.value);
    }
    return {
      ...v,
      page: pageForLineDeno(layer, v.regionStartLine),
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
  if (si) out.push(judge('special_instructions_verbatim' satisfies VerbatimField, si, null));

  const bt = result.verbatim?.broker_terms?.value;
  if (bt) out.push(judge('broker_terms_verbatim' satisfies VerbatimField, bt, null));

  (result.stops ?? []).forEach((stop: ParsedResult, i: number) => {
    const notes = stop?.notes_verbatim?.value;
    if (notes) out.push(judge('stop_notes_verbatim' satisfies VerbatimField, notes, i, i + 1));
  });

  out.forEach((v) => {
    if (v.transcriptionDamage?.length) {
      console.warn(
        `ingest verbatim capture damaged — field=${v.field} page=${v.page ?? '?'} ` +
        `${damageFingerprint(v.transcriptionDamage)}`,
      );
    }
  });

  return { checks: out, adopted, layerAvailable: !!layer?.available };
}

/** Returns a copy of the parse with one verbatim capture replaced. */
function replaceCapture(
  result: ParsedResult, field: string, parsedStopIndex: number | null, text: string,
): ParsedResult {
  const next = structuredClone(result);
  if (parsedStopIndex === null) {
    const key = field === 'broker_terms_verbatim' ? 'broker_terms' : 'special_instructions';
    const slot = next.verbatim?.[key];
    if (slot) slot.value = text;
  } else {
    const slot = next.stops?.[parsedStopIndex]?.notes_verbatim;
    if (slot) slot.value = text;
  }
  return next;
}
