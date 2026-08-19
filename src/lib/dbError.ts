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
