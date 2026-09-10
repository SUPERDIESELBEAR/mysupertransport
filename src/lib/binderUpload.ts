import { supabase } from '@/integrations/supabase/client';

/**
 * Duplicate protection for binder uploads.
 *
 * Layer 1 — recognise a file by its contents, not its name: a SHA-256 digest of the
 *           bytes is calculated before upload, so a renamed copy still matches.
 * Layer 3 — stale-view check: the update is scoped to the uploaded_at the client
 *           loaded, so a colleague's replacement cannot be silently overwritten.
 *
 * Layer 2 (one live document per slot) is enforced in the database by
 * trg_single_live_binder_document plus the existing version-archiving trigger.
 */

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof (file as any).arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsArrayBuffer(file);
  });
}

/** SHA-256 hex digest of a file's bytes. */
export async function hashFile(file: Blob): Promise<string> {
  const buffer = await readArrayBuffer(file);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}



export interface DuplicateMatch {
  id: string;
  name: string;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_name?: string | null;
  /** True when the match is the very slot being uploaded into. */
  sameSlot: boolean;
}

/**
 * Looks for a document already on file with identical contents, for the same
 * driver (or company-wide scope).
 */
export async function findDuplicateByHash(params: {
  contentHash: string;
  scope: 'company_wide' | 'per_driver';
  driverId: string | null;
  name: string;
}): Promise<DuplicateMatch | null> {
  const { contentHash, scope, driverId, name } = params;
  let query = (supabase as any)
    .from('inspection_documents')
    .select('id, name, uploaded_at, uploaded_by')
    .eq('scope', scope)
    .eq('content_hash', contentHash)
    .limit(1);
  query = driverId ? query.eq('driver_id', driverId) : query.is('driver_id', null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) return null;

  let uploader_name: string | null = null;
  if (row.uploaded_by) {
    const { data: p } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', row.uploaded_by)
      .maybeSingle();
    if (p) uploader_name = [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
  }

  return { ...row, uploader_name, sameSlot: row.name === name };
}

export class StaleBinderDocumentError extends Error {
  constructor() {
    super('This document was replaced by someone else while you had it open. Reload to see the current copy.');
    this.name = 'StaleBinderDocumentError';
  }
}

/**
 * Replaces the file on an existing binder slot, refusing if the row changed since
 * the client loaded it. Returns nothing; throws StaleBinderDocumentError on conflict.
 */
export async function replaceBinderDocumentFile(params: {
  documentId: string;
  expectedUploadedAt: string | null;
  fileUrl: string | null;
  filePath: string;
  contentHash: string;
  userId: string;
}): Promise<void> {
  const { documentId, expectedUploadedAt, fileUrl, filePath, contentHash, userId } = params;
  let q = (supabase as any)
    .from('inspection_documents')
    .update({
      file_url: fileUrl,
      file_path: filePath,
      content_hash: contentHash,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
    })
    .eq('id', documentId);
  q = expectedUploadedAt ? q.eq('uploaded_at', expectedUploadedAt) : q.is('uploaded_at', null);

  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new StaleBinderDocumentError();
}

/** Human sentence describing a duplicate match, for the confirmation dialog. */
export function describeDuplicate(match: DuplicateMatch): string {
  const who = match.uploader_name ? `by ${match.uploader_name}` : 'already';
  const when = match.uploaded_at
    ? new Date(match.uploaded_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'earlier';
  const where = match.sameSlot ? 'in this slot' : `under "${match.name}"`;
  return `This exact file is already on file ${where}, uploaded ${who} on ${when}.`;
}
