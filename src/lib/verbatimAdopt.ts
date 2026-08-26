/**
 * Canonical location: supabase/functions/_shared/verbatim/verbatimAdopt.ts
 *
 * The implementation moved so the ingest edge function can run layer adoption
 * server-side without a browser. This shim keeps every existing import path
 * (`@/lib/verbatimAdopt`) working unchanged — do not re-inline the logic here;
 * the edge copy must stay the single source of truth.
 */
export * from '../../supabase/functions/_shared/verbatim/verbatimAdopt';
