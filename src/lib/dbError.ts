/**
 * Shared helpers for surfacing Supabase/Postgres errors.
 *
 * supabase-js rejects with plain objects (PostgrestError / FunctionsError shapes),
 * not `Error` instances, so `e instanceof Error` narrowing swallows the real
 * message. Use these helpers everywhere in the TMS instead.
 */

export type DbErrorShape = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function asShape(err: unknown): DbErrorShape | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : null);
  return { message: pick('message'), code: pick('code'), details: pick('details'), hint: pick('hint') };
}

/**
 * Structured read of a thrown value, shape-aware.
 *
 * supabase-js rejects with a plain object, so `err instanceof Error` is false
 * and `String(err)` yields "[object Object]" — the code, details and hint are
 * destroyed exactly when they are needed. Use this whenever the parts have to
 * be rendered separately; use getDbErrorMessage when one sentence will do.
 */
export function getDbErrorParts(
  err: unknown,
  fallback = 'Something went wrong.',
): Required<DbErrorShape> {
  const empty = { message: fallback, code: null, details: null, hint: null };
  if (err == null) return empty;
  if (typeof err === 'string') return { ...empty, message: err.trim() || fallback };

  const s = asShape(err);
  if (s && (s.message || s.code || s.details || s.hint)) {
    return {
      message: s.message || (err instanceof Error ? err.message : null) || fallback,
      code: s.code ?? null,
      details: s.details ?? null,
      hint: s.hint ?? null,
    };
  }
  if (err instanceof Error && err.message) return { ...empty, message: err.message };

  const str = String(err);
  // "[object Object]" is never information — prefer the fallback over noise.
  return { ...empty, message: str && str !== '[object Object]' ? str : fallback };
}

/** Human-readable message including code/details/hint when present. */
export function getDbErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (typeof err === 'string' && err.trim()) return err;
  const s = asShape(err);
  if (!s) return fallback;

  const parts: string[] = [];
  if (s.message) parts.push(s.message);
  if (s.details && s.details !== s.message) parts.push(s.details);
  if (s.hint) parts.push(`Hint: ${s.hint}`);

  let msg = parts.join(' — ');
  if (!msg) msg = fallback;
  if (s.code) msg = `${msg} [${s.code}]`;
  return msg;
}

/** Log the full error object plus the payload that triggered it. */
export function logDbError(label: string, err: unknown, payload?: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[db] ${label}`, { error: err, ...(payload !== undefined ? { payload } : {}) });
}
