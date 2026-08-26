/**
 * Canonical location: supabase/functions/_shared/verbatim/verbatimVerify.ts
 *
 * The implementation moved so the ingest edge function can run verbatim
 * verification server-side without a browser. This shim keeps every existing
 * import path (`@/lib/verbatimVerify`) working unchanged — do not re-inline
 * the logic here; the edge copy must stay the single source of truth.
 */
export * from '../../supabase/functions/_shared/verbatim/verbatimVerify';
