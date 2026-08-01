/**
 * Demo-mode outbound suppression, made visible.
 *
 * A demo run must not put anything in a real inbox, the bell, or a public URL.
 * Suppressing silently would make the flow look broken, so every suppressed
 * send announces itself and the app shows the driver or staff member exactly
 * what would have gone out.
 *
 * Dependency-free on purpose: this is imported by the roadside queue handlers,
 * whose bundle is constrained (see roadsideImportGraph.test.ts).
 */
export const DEMO_SUPPRESSED_EVENT = 'superdrive:demo-suppressed';

export interface DemoSuppressionDetail {
  /** What was suppressed, in the driver's language. */
  what: string;
  /** Who it would have gone to, already display-safe. */
  to?: string[];
  note?: string;
}

/** Shape returned by every edge function that suppresses a demo send. */
export interface SuppressedResponse {
  suppressed?: boolean;
  suppressed_reason?: string;
  would_have_sent?: { to?: string[]; subject?: string; attachment?: string };
}

export function announceDemoSuppression(detail: DemoSuppressionDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DEMO_SUPPRESSED_EVENT, { detail }));
}

/** Announce if the edge response says it suppressed. Returns true when it did. */
export function announceIfSuppressed(
  data: unknown,
  what: string,
): boolean {
  const res = data as SuppressedResponse | null;
  if (!res?.suppressed) return false;
  announceDemoSuppression({ what, to: res.would_have_sent?.to });
  return true;
}
