/**
 * Scheduled-function caller check. A caller is admitted when it presents
 * `x-cron-secret` equal to CRON_SECRET (what every cron.job sends), or the
 * service-role key as a bearer token (server-to-server). Anything else —
 * including the publishable key — is refused. Fail-closed: an unset
 * CRON_SECRET admits nobody by header.
 */
export function isCronCaller(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headerSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
  return Boolean((cronSecret && headerSecret === cronSecret) || (serviceKey && bearer === serviceKey));
}

export function forbidden(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'Forbidden: scheduled function' }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
