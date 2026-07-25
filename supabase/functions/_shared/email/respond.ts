// Standard JSON responses with CORS headers baked in.
// Every response goes through here so browsers never see a bare
// "Edge Function returned a non-2xx status code" without details.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

export function preflight(): Response {
  return new Response('ok', { headers: corsHeaders });
}

export function ok(body: unknown = { success: true }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Uniform error envelope. Always includes CORS + JSON headers so the
 * browser can read the real cause via FunctionsHttpError.context.text().
 */
export function fail(
  status: number,
  error: string,
  details?: unknown,
): Response {
  const payload: Record<string, unknown> = { error, status };
  if (details !== undefined) payload.details = details;
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

/**
 * Wrap a handler so any thrown error becomes a readable JSON 500 with CORS.
 * Use in Deno.serve to prevent bare crashes from reaching the browser.
 */
export function withErrorEnvelope(
  handler: (req: Request) => Promise<Response>,
  functionName: string,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return preflight();
    try {
      return await handler(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[${functionName}] uncaught error:`, message, stack);
      return fail(500, `${functionName} failed: ${message}`, { stack });
    }
  };
}