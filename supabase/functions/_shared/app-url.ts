const FALLBACK = 'https://mysupertransport.lovable.app';

// Hostnames that serve the marketing site — NOT the React app. If APP_URL is
// accidentally set to one of these (or a subdomain), quick links in emails
// would 404 on the marketing site. Fall back to the app host instead.
// Env var MARKETING_HOSTS (comma-separated) appends to this list at runtime.
const DEFAULT_MARKETING_HOSTS = ['mysupertransport.com', 'www.mysupertransport.com'];

function isMarketingHost(hostname: string): boolean {
  const extra = (Deno.env.get('MARKETING_HOSTS') || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const blocked = new Set([...DEFAULT_MARKETING_HOSTS, ...extra]);
  const host = hostname.toLowerCase();
  return blocked.has(host);
}

/**
 * Build a fully-qualified app URL from a path. Sanitizes the APP_URL env var:
 *  - Trims whitespace
 *  - Adds https:// if scheme is missing
 *  - Rejects marketing-only hosts (they don't serve the React app)
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
  let rejectionReason = 'invalid';
  try {
    parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const isIpv4Address = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isLocalHost = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local');

    // Reject non-http(s), local/dev hosts, bare hosts, and numeric IPs (e.g. "0.0.9.22") in app emails.
    if (!/^https?:$/.test(parsed.protocol) || !hostname.includes('.') || isIpv4Address || isLocalHost) {
      parsed = null;
    }
    // Reject marketing-only hosts that don't serve the React app.
    if (parsed && isMarketingHost(hostname)) {
      parsed = null;
      rejectionReason = 'marketing-host';
    }
  } catch {
    parsed = null;
  }
  const base = parsed ? parsed.origin : FALLBACK;
  if (!parsed) {
    console.warn(`[app-url] APP_URL "${original}" rejected (${rejectionReason}); falling back to ${FALLBACK}`);
  }
  return base.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}