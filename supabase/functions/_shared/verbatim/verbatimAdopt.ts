/**
 * Where a stored verbatim capture comes from: the page's own text layer, or the
 * model's transcription of it.
 *
 * The model is a reader of the page and can paraphrase, tidy, or drop a phone
 * number. The text layer is the page, so where it is clean it is the better
 * source — there is nothing to transcribe and nothing to lose. Where it is
 * damaged it is the worse source, and Blue Grace is the standing counterexample:
 * that document's Special Instructions block renders `53' 102"` as a pilcrow, and
 * shipping the layer there would store the exact corruption we removed yesterday.
 *
 * So adoption is conservative and one-directional: the layer is used only when it
 * carries no corruption marker at all and passes a truncation sanity check.
 * Everything else falls back to the model, which is today's behaviour.
 *
 * ## Why the truncation check exists
 *
 * Under the old rule a region cut two lines short cost a similarity point. Under
 * this rule it costs stored text: the value would come from the page and match
 * the page by construction, so nothing downstream could flag it. Three signals
 * guard that, and any one of them sends the field back to the model:
 *
 *   - `shorter_than_model`          the region is materially shorter than the
 *                                   model's transcription of the same block
 *   - `model_continues_past_region` the tail of the model's capture is not inside
 *                                   the region, i.e. the model read past its end
 *   - `ends_mid_sentence`           the region's last line breaks on a comma or a
 *                                   dangling function word
 */

import { resolveFieldRegion, type VerbatimField } from './verbatimRegions.ts';
import {
  LAYER_DEGRADATION_LIMIT,
  detectTranscriptionDamage,
  normalizeForVerbatim,
  regionDamage,
} from './verbatimVerify.ts';

export type VerbatimOrigin = 'text_layer' | 'model';

export type VerbatimOriginReason =
  /** The region resolved, carries no damage marker, and looks complete. */
  | 'layer_clean'
  /** The region prints corruption the printed page does not have. */
  | 'layer_damaged'
  /** No printed anchor placed the field on the page. */
  | 'region_unresolved'
  /** A scan, a photo, or an extraction failure — there is no layer to read. */
  | 'no_layer'
  /**
   * The region resolved, but its boundaries do not look like the boundaries of
   * the whole printed block — so they cannot be trusted as the stored value's
   * boundaries. Not "the region is short": a region three times longer than the
   * model's transcription lands here too when the model read past its end.
   */
  | 'region_boundary_uncertain'
  /** Typed off the rendered page by a person; nothing overrules that. */
  | 'manual_repair';

export type TruncationSignal =
  | 'shorter_than_model'
  | 'model_continues_past_region'
  | 'ends_mid_sentence';

export interface VerbatimAdoption {
  origin: VerbatimOrigin;
  reason: VerbatimOriginReason;
  /** The value to store. */
  value: string;
  /** What the model transcribed, kept so the two are comparable afterwards. */
  modelValue: string;
  /** What the region prints, when one resolved. */
  layerValue: string | null;
  /** Region length over model length. Below 1 means the region holds less text. */
  layerLengthRatio: number | null;
  /** Damage share of the region's own raw lines. */
  layerDamage: number | null;
  /** Which sanity checks objected, when any did. */
  truncationSignals: TruncationSignal[] | null;
}

/** Region text is minus the layer's padding, not minus its content. */
export function tidyLayerLines(rawLines: string[]): string {
  return rawLines
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** A comma, a colon, or a dangling function word: the block continues below. */
const MID_SENTENCE =
  /(?:[,;:]|\b(?:and|or|but|the|a|an|to|of|for|with|at|in|on|by|from|is|are|be|will|must|shall|may|any|all|not|no|if|that|which|as|per|upon|within|prior)\b)$/i;

const TAIL = 30;
const MIN_RATIO = 0.9;

export function truncationSignals(layerText: string, modelText: string): TruncationSignal[] {
  const out: TruncationSignal[] = [];
  const l = normalizeForVerbatim(layerText).text;
  const m = normalizeForVerbatim(modelText).text;
  if (!l || !m) return out;

  if (l.length / m.length < MIN_RATIO) out.push('shorter_than_model');

  // The model's last words should be inside the region. When they are not, the
  // model read text the region's boundary excluded.
  if (m.length >= TAIL && !l.includes(m.slice(-TAIL))) out.push('model_continues_past_region');

  if (MID_SENTENCE.test(l.trim())) out.push('ends_mid_sentence');

  return out;
}

/**
 * @parser-check
 * Chooses the source of one stored verbatim capture: the printed text layer where
 * it is clean and complete, the model's transcription otherwise.
 */
export function adoptVerbatim(
  field: string,
  modelValue: string | null | undefined,
  layer: string | null | undefined,
  opts: { stopNumber?: number; source?: 'parsed' | 'manual_repair'; degradationLimit?: number } = {},
): VerbatimAdoption {
  const model = (modelValue ?? '').trim();
  const base = {
    value: model,
    modelValue: model,
    layerValue: null,
    layerLengthRatio: null,
    layerDamage: null,
    truncationSignals: null,
  };

  if (opts.source === 'manual_repair') {
    return { ...base, origin: 'model', reason: 'manual_repair' };
  }
  if (!layer || !layer.trim() || !model) {
    return { ...base, origin: 'model', reason: 'no_layer' };
  }

  const resolved = resolveFieldRegion(layer, field as VerbatimField, { stopNumber: opts.stopNumber });
  if (!resolved.region) {
    return { ...base, origin: 'model', reason: 'region_unresolved' };
  }

  const layerValue = tidyLayerLines(resolved.region.rawLines);
  const damage = regionDamage(resolved.region.rawLines);
  const ratio = model.length ? normalizeForVerbatim(layerValue).text.length
    / Math.max(1, normalizeForVerbatim(model).text.length) : null;

  const withLayer = { ...base, layerValue, layerDamage: damage, layerLengthRatio: ratio };

  // Any corruption marker at all disqualifies the region. A single pilcrow in an
  // 800-character block is only 0.1% damage, so a share-based limit alone would
  // have shipped Blue Grace's pilcrow as the stored value.
  const artifacts = detectTranscriptionDamage(layerValue);
  const limit = opts.degradationLimit ?? LAYER_DEGRADATION_LIMIT;
  if (artifacts.length || damage > limit) {
    return { ...withLayer, origin: 'model', reason: 'layer_damaged' };
  }

  const signals = truncationSignals(layerValue, model);
  if (signals.length) {
    return { ...withLayer, origin: 'model', reason: 'region_boundary_uncertain', truncationSignals: signals };
  }

  return { ...withLayer, origin: 'text_layer', reason: 'layer_clean', value: layerValue };
}
