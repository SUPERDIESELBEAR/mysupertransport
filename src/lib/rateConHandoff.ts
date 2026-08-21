import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

/**
 * One-shot in-memory handoff of an uploaded rate confirmation from the Create Load
 * form to the revised-rate-confirmation flow on an existing load's detail page.
 *
 * Both portals route client-side, so the File object survives the navigation. It is
 * consumed exactly once and never persisted. If it is missing or stale (hard reload,
 * deep link, restored tab) the revision modal simply opens on its upload step and
 * the dispatcher picks the file — no error, nothing half-filled.
 */

interface RateConHandoff {
  targetLoadId: string;
  file: File;
  parsed: ParsedRateConfirmation | null;
  createdAt: number;
}

const MAX_AGE_MS = 5 * 60 * 1000;

let pending: RateConHandoff | null = null;

export function stashRateConForLoad(
  targetLoadId: string, file: File, parsed: ParsedRateConfirmation | null,
): void {
  pending = { targetLoadId, file, parsed, createdAt: Date.now() };
}

/** Returns the handoff for this load once, then clears it. */
export function takeRateConForLoad(
  loadId: string | null | undefined,
): { file: File; parsed: ParsedRateConfirmation | null } | null {
  if (!pending || !loadId) return null;
  const stale = Date.now() - pending.createdAt > MAX_AGE_MS;
  if (pending.targetLoadId !== loadId || stale) {
    if (stale) pending = null;
    return null;
  }
  const { file, parsed } = pending;
  pending = null;
  return { file, parsed };
}

export function clearRateConHandoff(): void {
  pending = null;
}
