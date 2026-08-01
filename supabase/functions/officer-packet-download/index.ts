/**
 * Officer packet download (Pass B §7 + §8).
 *
 * Token-gated. The bytes are streamed by this function using the service role;
 * no signed storage URL is ever handed out, so the only way to the file is
 * through the token — which is revocable, expiring, throttled and logged.
 *
 * TWO LIMITS, TWO FAIL MODES, deliberately opposite:
 *
 *   per-token, in resolve_officer_packet_token → FAILS CLOSED.
 *     If the counter cannot be read we do not know how many times a driver's
 *     complete logs have been fetched, and an unlogged, uncounted fetch of a
 *     compliance document is not something to serve.
 *
 *   per-IP, here → FAILS OPEN.
 *     A legitimate roadside fetch 404ing because an in-memory counter was
 *     reset or unavailable is worse than an unthrottled window on a token that
 *     dies in four hours.
 *
 * SCOPE NOTE: only `officer_packet` resolves through this endpoint.
 * `inspection_document` (the printed QR stickers) still calls
 * resolve_share_token directly from the browser, so it gets the per-token
 * limit but NOT the per-IP limit. That gap is open and recorded; closing it
 * means moving every already-printed sticker's resolution behind an endpoint.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-IP ceiling: requests allowed from one address in the window. */
const IP_LIMIT = 40;
const IP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Best-effort, per-instance. Deliberately not a database counter: the point of
 * this limit is to blunt scripted probing cheaply, and it must never be the
 * reason a real officer gets nothing.
 */
const ipHits = new Map<string, number[]>();

function ipThrottled(ip: string | null): boolean {
  try {
    if (!ip) return false;
    const now = Date.now();
    const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    hits.push(now);
    ipHits.set(ip, hits);
    if (ipHits.size > 5000) ipHits.clear();
    return hits.length > IP_LIMIT;
  } catch {
    return false; // fail open
  }
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  if (!token || !UUID_RE.test(token)) return textResponse(400, 'Invalid link.');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip');
  if (ipThrottled(ip)) return textResponse(429, 'Too many requests. Try again shortly.');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Forwarded so the RPC logs the real requester rather than the function.
      global: {
        headers: {
          'x-forwarded-for': ip ?? '',
          'user-agent': req.headers.get('user-agent') ?? '',
        },
      },
    },
  );

  const { data, error } = await supabase.rpc('resolve_officer_packet_token', { p_token: token });
  if (error) {
    console.error('resolve_officer_packet_token failed:', error.message);
    return textResponse(500, 'This link could not be checked. Ask the driver to send the packet again.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.storage_path) {
    // Expired, revoked, throttled or unknown — all indistinguishable to the
    // holder of a link by design.
    return textResponse(404, 'This link is no longer valid. Ask the driver to send the packet again.');
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(row.bucket ?? 'eld-notices').download(row.storage_path);
  if (downloadError || !file) {
    console.error('officer packet download failed:', downloadError?.message);
    return textResponse(502, 'The packet could not be read. Ask the driver to send it again.');
  }

  return new Response(await file.arrayBuffer(), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="rods-8-day-packet.pdf"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
});