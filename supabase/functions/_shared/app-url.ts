const FALLBACK = 'https://mysupertransport.lovable.app';

/**
 * Build a fully-qualified app URL from a path. Sanitizes the APP_URL env var:
 *  - Trims whitespace
 *  - Adds https:// if scheme is missing
 *  - Falls back to the published lovable URL if the value can't be parsed
 * Logs a warning when the fallback fires so misconfiguration is visible.
 */
export function buildAppUrl(path: string): string {
  let raw = (Deno.env.get('APP_URL') || '').trim();
  const original = raw;
  if (raw && !/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
    // Reject non-http(s) and obviously broken hosts (e.g. "0.0.9.22", "localhost" in prod)
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) {
      parsed = null;
    }
  } catch {
    parsed = null;
  }
  const base = parsed ? parsed.origin : FALLBACK;
  if (!parsed) {
    console.warn(`[app-url] APP_URL "${original}" is invalid; falling back to ${FALLBACK}`);
  }
  return base.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}