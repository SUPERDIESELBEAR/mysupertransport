import { supabase } from '@/integrations/supabase/client';

export interface OperatorDocumentRow {
  id: string;
  operator_id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

/**
 * Soft-delete an operator document. The storage object is left in place for
 * 30 days so it can be restored from the "Recently Deleted" tray. The DB
 * trigger writes an audit_log entry and resets the matching Stage 2 status
 * if this was the last live copy of that document type.
 */
export async function softDeleteOperatorDocument(
  id: string,
  reason?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('operator_documents')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
      delete_reason: reason ?? null,
    } as any)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Restore a soft-deleted operator document. */
export async function restoreOperatorDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('operator_documents')
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    } as any)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Permanently delete an operator document — removes the underlying storage
 * object first, then the DB row. Used by the "Delete permanently" button and
 * by the nightly purge job.
 */
export async function hardDeleteOperatorDocument(
  row: Pick<OperatorDocumentRow, 'id' | 'file_url'>,
): Promise<void> {
  if (row.file_url) {
    try {
      const url = new URL(row.file_url);
      const match =
        url.pathname.match(/\/object\/sign\/operator-documents\/(.+)/) ||
        url.pathname.match(/\/object\/public\/operator-documents\/(.+)/);
      if (match) {
        const path = decodeURIComponent(match[1].split('?')[0]);
        await supabase.storage.from('operator-documents').remove([path]);
      }
    } catch {
      // Ignore storage errors — still remove the row
    }
  }
  const { error } = await supabase
    .from('operator_documents')
    .delete()
    .eq('id', row.id);
  if (error) throw new Error(error.message);
}

/** Fetch soft-deleted docs (last 30 days) for a given operator. Staff-only via RLS. */
export async function listDeletedOperatorDocuments(
  operatorId: string,
): Promise<OperatorDocumentRow[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('operator_documents')
    .select('id, operator_id, document_type, file_name, file_url, uploaded_at, deleted_at, deleted_by, delete_reason')
    .eq('operator_id', operatorId)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', since)
    .order('deleted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OperatorDocumentRow[];
}