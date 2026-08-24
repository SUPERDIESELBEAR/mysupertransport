import type { PdfTextLayer } from '@/lib/pdfTextLayer';
import type { VerbatimCheck } from '@/lib/verbatimCheck';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

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
 */

export interface ParseRunFingerprint {
  at: string;
  /** Stable hash of the extracted text layer, or null when there was none. */
  layerHash: string | null;
  layerLines: number;
  layerPages: number;
  layerChars: number;
  /** Model identity as reported by the edge function. */
  model: string | null;
  /** Provider run identity. Null means the provider returned none. */
  systemFingerprint: string | null;
  /** Whether the request pinned temperature/seed, as reported by the function. */
  pinned: boolean | null;
  seed: number | null;
  /** field -> verdict, e.g. `special_instructions_verbatim: anchor_not_found`. */
  fields: { field: string; verdict: string }[];
  /** Stop appointment values as parsed — the other field that moved between runs. */
  appointments: { stop: number; start: string | null; end: string | null }[];
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

export function buildParseFingerprint(args: {
  layer: PdfTextLayer | null;
  checks: VerbatimCheck[];
  parsed: ParsedRateConfirmation;
}): ParseRunFingerprint {
  const text = args.layer?.text ?? '';
  const meta = (args.parsed as unknown as {
    model?: string | null;
    system_fingerprint?: string | null;
    sampling?: { pinned?: boolean; seed?: number | null } | null;
  });

  return {
    at: new Date().toISOString(),
    layerHash: text ? hashText(text) : null,
    layerLines: text ? text.split('\n').length : 0,
    layerPages: args.layer?.pageCount ?? 0,
    layerChars: text.length,
    model: meta.model ?? null,
    systemFingerprint: meta.system_fingerprint ?? null,
    pinned: meta.sampling?.pinned ?? null,
    seed: meta.sampling?.seed ?? null,
    fields: args.checks.map(c => ({
      field: c.parsedStopIndex === null
        ? c.field
        : `${c.field} (stop ${c.parsedStopIndex + 1})`,
      verdict: c.regionFailure ?? c.verdict ?? 'ok',
    })),
    appointments: (args.parsed.stops ?? []).map((s, i) => ({
      stop: i + 1,
      start: s.appointment_start?.value ?? null,
      end: s.appointment_end?.value ?? null,
    })),
  };
}

/** One line per run, for pasting two runs side by side. */
export function fingerprintSummary(f: ParseRunFingerprint): string {
  return [
    `layer ${f.layerHash ?? 'none'} (${f.layerLines} lines / ${f.layerPages} pages / ${f.layerChars} chars)`,
    `model ${f.model ?? 'unknown'}${f.systemFingerprint ? ` · run ${f.systemFingerprint}` : ' · no run id'}`,
    f.pinned === null ? 'sampling unknown' : f.pinned ? `pinned (seed ${f.seed ?? '—'})` : 'not pinned',
  ].join(' · ');
}
