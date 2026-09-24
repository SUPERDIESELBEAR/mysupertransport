import type { Database } from './types';

type PublicSchema = Database['public'];
type TableName = keyof PublicSchema['Tables'];

type UpdateOf<T extends TableName> = PublicSchema['Tables'][T]['Update'];
type InsertOf<T extends TableName> = PublicSchema['Tables'][T]['Insert'];

/**
 * Typed passthrough for Supabase `.update()` payloads that are built with
 * dynamic keys (e.g. `{ [col]: value }`). Preserves column-name and value
 * checking for statically-known fields while allowing computed keys —
 * without falling back to `as any`, which disables all type safety.
 *
 *   .update(updatePayload('applications', { [col]: newDateStr }))
 */
export function updatePayload<T extends TableName>(
  _table: T,
  patch: Partial<UpdateOf<T>> & Record<string, unknown>,
): UpdateOf<T> {
  return patch as UpdateOf<T>;
}

/**
 * Typed passthrough for Supabase `.insert()` payloads built with dynamic
 * keys. Same rationale as `updatePayload`.
 */
export function insertPayload<T extends TableName>(
  _table: T,
  row: Partial<InsertOf<T>> & Record<string, unknown>,
): InsertOf<T> {
  return row as InsertOf<T>;
}
/**
 * Insert payload for tables whose `company_id` is stamped by a database
 * trigger (stamp_company_id / trg_stamp_company_from_parent). The generated
 * types mark the column required because it is NOT NULL, but the client must
 * not choose a carrier — the trigger resolves it. Everything else stays typed.
 */
export function stampedInsert<T extends TableName>(
  _table: T,
  row: Omit<InsertOf<T>, 'company_id'>,
): InsertOf<T> {
  return row as InsertOf<T>;
}
