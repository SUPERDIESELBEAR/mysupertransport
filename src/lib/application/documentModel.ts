/**
 * Browser-side view of the printed application model.
 *
 * Canonical location: supabase/functions/_shared/application/documentModel.ts
 * Both the staff print view and the server PDF renderer build from this, so a
 * question added to the application appears in both outputs or in neither.
 */
export * from '../../../supabase/functions/_shared/application/documentModel';
export * as applicationCopy from '../../../supabase/functions/_shared/application/copy';
