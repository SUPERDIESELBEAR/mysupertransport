import type { PdfTextLayer } from '@/lib/pdfTextLayer';
import type { VerbatimCheck } from '@/lib/verbatimCheck';
import type { DiscardedField, ParsedRateConfirmation } from '@/lib/rateConfirmation';

/**
 * A comparable record of ONE parse run.
 *
 * Two runs of the same document produced different results — special
 * instructions resolved on one and not the other, appointment dates present on
 * one and blank on the other. With nothing recorded per run, there was no way
 * to say whether the extracted text layer moved or the model's answer did.
 *
 * The fingerprint separates those two. The layer hash covers what the browser
 * read off the page; the field outcomes cover what came back from the model.
 * If the layer hash matches between runs and the outcomes differ, the model
 * moved. If the layer hash differs, extraction moved and the model is not the
 * suspect. No document text is kept — only a hash, counts and verdicts.
 *
 * STANDING RULE, learned here: two readers of the same parsed field must share
 * one gate, and a diagnostic may never print a value without reporting whether
 * that value survived. This file read `appointment_start.value` raw while the
 * form writer read it through the low-confidence gate, so the fingerprint
 * showed both appointment windows while both form fields sat empty. Every
 * appointment now carries its confidence, and `discarded` names everything the
 * gate refused.
 */

export interface ParseRunFingerprint {
  at: string;
  /** Stable hash of the extracted text layer, or null when there was none. */
  layerHash: string | null;
  layerLines: number;
  layerPages: number;
  layerChars: number;
  /** Model identity as reported by the edge function's `run` envelope. */
  model: string | null;
  /** Provider run identity. Null means the provider returned none. */
  systemFingerprint: string | null;
  /** Whether the request pinned temperature/seed, as reported by the function. */
  pinned: boolean | null;
  seed: number | null;
  /**
   * Whether the PROVIDER acknowledged the seed. Sending a seed is not the same
   * as the provider honouring it, and reporting "pinned" off the request alone
   * claimed determinism nobody had verified.
   */
  seedEchoed: boolean | null;
  /** field -> verdict, e.g. `special_instructions_verbatim: anchor_not_found`. */
  fields: { field: string; verdict: string }[];
  /** Stop appointments as parsed, WITH the confidence the form gate reads. */
  appointments: {
    stop: number;
    start: string | null;
    startConfidence: string | null;
    end: string | null;
    endConfidence: string | null;
  }[];
  /** Values the model returned that the low-confidence gate threw away. */
  discarded: DiscardedField[];
}

/** FNV-1a: short, stable, dependency-free. Not a security hash. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface RunEnvelope {
  model?: string | null;
  temperature?: number | null;
  seed?: number | null;
  seed_echoed?: boolean | null;
  system_fingerprint?: string | null;
}

export function buildParseFingerprint(args: {
  layer: PdfTextLayer | null;
  checks: VerbatimCheck[];
  parsed: ParsedRateConfirmation;
  /** What the form writer discarded on this same run. */
  discarded?: DiscardedField[];
}): ParseRunFingerprint {
  const text = args.layer?.text ?? '';
  // The edge function returns everything about the run under a single `run`
  // object. This read `parsed.model` / `parsed.system_fingerprint` /
  // `parsed.sampling` — three keys that never existed on the response — which is
  // why every run reported "model unknown · no run id · sampling unknown" while
  // the values were being sent all along.
  const run = ((args.parsed as unknown as { run?: RunEnvelope }).run ?? {}) as RunEnvelope;

  return {
    at: new Date().toISOString(),
    layerHash: text ? hashText(text) : null,
    layerLines: text ? text.split('\n').length : 0,
    layerPages: args.layer?.pageCount ?? 0,
    layerChars: text.length,
    model: run.model ?? null,
    systemFingerprint: run.system_fingerprint ?? null,
    pinned: run.temperature === undefined || run.temperature === null
      ? null
      : run.temperature === 0 && run.seed !== null && run.seed !== undefined,
    seed: run.seed ?? null,
    seedEchoed: run.seed_echoed ?? null,
    fields: args.checks.map(c => ({
      field: c.parsedStopIndex === null
        ? c.field
        : `${c.field} (stop ${c.parsedStopIndex + 1})`,
      verdict: c.regionFailure ?? c.verdict ?? 'ok',
    })),
    appointments: (args.parsed.stops ?? []).map((s, i) => ({
      stop: i + 1,
      start: s.appointment_start?.value ?? null,
      startConfidence: s.appointment_start?.value ? (s.appointment_start.confidence ?? null) : null,
      end: s.appointment_end?.value ?? null,
      endConfidence: s.appointment_end?.value ? (s.appointment_end.confidence ?? null) : null,
    })),
    discarded: args.discarded ?? [],
  };
}

/** One line per run, for pasting two runs side by side. */
export function fingerprintSummary(f: ParseRunFingerprint): string {
  return [
    `layer ${f.layerHash ?? 'none'} (${f.layerLines} lines / ${f.layerPages} pages / ${f.layerChars} chars)`,
    `model ${f.model ?? 'unknown'}${f.systemFingerprint ? ` · run ${f.systemFingerprint}` : ' · no run id'}`,
    f.pinned === null ? 'sampling unknown' : f.pinned ? `pinned (seed ${f.seed ?? '—'})` : 'not pinned',
    determinismNote(f),
  ].join(' · ');
}

/**
 * The honest answer about determinism. A seed the provider never acknowledged is
 * unverified, not working — saying otherwise is the failure this reports on.
 */
export function determinismNote(f: ParseRunFingerprint): string {
  if (f.seedEchoed === true) return 'seed acknowledged by provider';
  if (f.seedEchoed === false) {
    return 'seed NOT acknowledged and no run id returned — determinism unverified on this provider';
  }
  return 'seed acknowledgement not reported';
}
