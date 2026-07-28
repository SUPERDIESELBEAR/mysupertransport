/**
 * Local marker for a "mobile preview" session — a real driver session started
 * by staff via a QR handoff. Used only for UI affordances (banner, auto sign-out);
 * it grants no privileges on its own.
 */
const KEY = 'superdrive_preview_session';
const MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes

export interface PreviewSessionMarker {
  name: string;
  startedAt: number;
}

export function startPreviewSession(name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, startedAt: Date.now() }));
  } catch {
    // Storage unavailable — banner simply won't show.
  }
}

export function getPreviewSession(): PreviewSessionMarker | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreviewSessionMarker;
    if (!parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPreviewSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

export function isPreviewSessionExpired(marker: PreviewSessionMarker): boolean {
  return Date.now() - marker.startedAt > MAX_AGE_MS;
}

export const PREVIEW_SESSION_MAX_AGE_MS = MAX_AGE_MS;
