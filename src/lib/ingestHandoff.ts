import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';
import type { VerbatimCheck } from '@/lib/verbatimCheck';

/**
 * One-shot in-memory handoff of an email-ingested rate confirmation from the
 * Rate Con Inbox to the Create Load form.
 *
 * Unlike the browser upload path, an ingested document was ALREADY parsed,
 * verbatim-verified and adopted server-side by receive-rate-con-email — the
 * parser component consumes this handoff and runs only its application half
 * (form fill, broker matching, diagnostics, fingerprint), never a second
 * gateway call and never a second verification that could disagree with what
 * the inbox displayed.
 *
 * Both portals route client-side, so the File object survives the navigation.
 * It is consumed exactly once and never persisted. If it is missing or stale
 * (hard reload, deep link, restored tab) the Create Load form simply opens
 * empty and the dispatcher uploads manually — no error, nothing half-filled.
 */

export interface IngestParseHandoff {
  queueId: string;
  file: File;
  /** The parse with server-side verbatim adoption already applied. */
  parsed: ParsedRateConfirmation;
  /** The verbatim checks exactly as the inbox displayed them. */
  checks: VerbatimCheck[];
  /** Server-extracted text layer, for the fingerprint and loadout assessment. */
  layerText: string;
  layerAvailable: boolean;
  pageCount: number;
  createdAt: number;
}

const MAX_AGE_MS = 5 * 60 * 1000;

let pending: IngestParseHandoff | null = null;

export function stashIngestParse(
  handoff: Omit<IngestParseHandoff, 'createdAt'>,
): void {
  pending = { ...handoff, createdAt: Date.now() };
}

/** Returns the pending ingest handoff once, then clears it. */
export function takeIngestParse(): IngestParseHandoff | null {
  if (!pending) return null;
  const stale = Date.now() - pending.createdAt > MAX_AGE_MS;
  const out = pending;
  pending = null;
  return stale ? null : out;
}

export function clearIngestParse(): void {
  pending = null;
}
