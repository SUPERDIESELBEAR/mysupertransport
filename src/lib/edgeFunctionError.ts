/**
 * Extract a human-readable error message from a Supabase edge-function call
 * failure. `FunctionsHttpError` exposes a `context` field whose shape is
 * inconsistent across runtimes (sometimes a `Response`, sometimes a plain
 * object with `body` or `error`). This helper tries each shape in turn
 * without `as any` casts at every call site.
 */

interface SupabaseFunctionError {
  message?: string;
  context?: Response | { body?: string; error?: string } | unknown;
}

const isResponse = (v: unknown): v is Response =>
  typeof Response !== 'undefined' && v instanceof Response;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export async function getEdgeFunctionErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): Promise<string> {
  if (!err) return fallback;

  const fnErr = err as SupabaseFunctionError;
  const ctx = fnErr.context;

  // Shape 1: context is a Response — read the JSON body.
  if (isResponse(ctx)) {
    try {
      const json: unknown = await ctx.clone().json();
      if (isRecord(json) && typeof json.error === 'string') return json.error;
      if (isRecord(json) && typeof json.message === 'string') return json.message;
    } catch {
      // fall through
    }
  }

  // Shape 2: context is a plain object with `body` (already-read text).
  if (isRecord(ctx) && typeof ctx.body === 'string') {
    try {
      const parsed: unknown = JSON.parse(ctx.body);
      if (isRecord(parsed) && typeof parsed.message === 'string') return parsed.message;
      if (isRecord(parsed) && typeof parsed.error === 'string') return parsed.error;
    } catch {
      // fall through
    }
  }

  // Shape 3: context exposes `error` directly.
  if (isRecord(ctx) && typeof ctx.error === 'string') return ctx.error;

  // Shape 4: top-level error message.
  if (typeof fnErr.message === 'string' && fnErr.message) return fnErr.message;

  return fallback;
}