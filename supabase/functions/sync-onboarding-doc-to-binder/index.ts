// sync-onboarding-doc-to-binder
//
// Mirrors a driver's onboarding upload (Form 2290 / vehicle registration) into
// their DOT inspection binder row, which is what the Vehicle Hub, roadside
// binder and Fleet Compliance all read. Runs server-side so it behaves the
// same for driver uploads, staff replacements and the one-time backfill, and
// so the storage object can be copied between buckets (drivers have no RLS
// rights on the binder bucket).
//
// Modes:
//   { operator_id, document_type }  → sync one operator's latest upload
//   { backfill: true }              → staff-only sweep over every eligible driver
import { preflight, ok, fail, withErrorEnvelope, requireAuthedUser } from '../_shared/email/index.ts';

const SRC_BUCKET = 'operator-documents';
const DEST_BUCKET = 'inspection-documents';
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

const SLOTS: Record<string, { name: string; folder: string }> = {
  form_2290: { name: 'Form 2290', folder: 'form-2290' },
  registration: { name: 'IRP Registration (cab card)', folder: 'irp-registration' },
};

/** Pull the storage object path out of a stored signed/public operator-documents URL. */
function pathFromUrl(fileUrl: string | null): string | null {
  if (!fileUrl) return null;
  try {
    const url = new URL(fileUrl);
    const m =
      url.pathname.match(/\/object\/sign\/operator-documents\/(.+)/) ||
      url.pathname.match(/\/object\/public\/operator-documents\/(.+)/) ||
      url.pathname.match(/\/object\/authenticated\/operator-documents\/(.+)/);
    if (!m) return null;
    return decodeURIComponent(m[1].split('?')[0]);
  } catch {
    return null;
  }
}

interface SyncResult {
  operator_id: string;
  document_type: string;
  status: 'synced' | 'skipped';
  reason?: string;
}

async function syncOne(
  supabase: any,
  operatorId: string,
  documentType: string,
  actorId: string | null,
): Promise<SyncResult> {
  const slot = SLOTS[documentType];
  const skip = (reason: string): SyncResult => ({
    operator_id: operatorId, document_type: documentType, status: 'skipped', reason,
  });
  if (!slot) return skip('unsupported document type');

  const { data: operator } = await supabase
    .from('operators')
    .select('id, user_id')
    .eq('id', operatorId)
    .maybeSingle();
  if (!operator?.user_id) return skip('operator has no login yet');

  // Newest live onboarding upload of this type
  const { data: doc } = await supabase
    .from('operator_documents')
    .select('id, file_url, file_name, uploaded_at')
    .eq('operator_id', operatorId)
    .eq('document_type', documentType)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc) return skip('no onboarding upload found');

  const srcPath = pathFromUrl(doc.file_url);
  if (!srcPath) return skip('could not resolve stored file path');

  // Existing binder row for this slot (one per driver — update, never stack)
  const { data: existing } = await supabase
    .from('inspection_documents')
    .select('id, file_path, source, uploaded_at')
    .eq('scope', 'per_driver')
    .eq('driver_id', operator.user_id)
    .eq('name', slot.name)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Already mirrored this exact upload — nothing to do.
  if (existing?.file_path?.includes(`/${doc.id}`)) {
    return skip('already in sync');
  }

  // ── Copy the object into the binder bucket ────────────────────────────────
  const { data: blob, error: dlErr } = await supabase.storage.from(SRC_BUCKET).download(srcPath);
  if (dlErr || !blob) return skip(`source file unavailable: ${dlErr?.message ?? 'not found'}`);

  const ext = (doc.file_name?.split('.').pop() || srcPath.split('.').pop() || 'pdf').toLowerCase();
  const destPath = `driver/${operator.user_id}/${slot.folder}/${doc.id}.${ext}`;
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(DEST_BUCKET)
    .upload(destPath, bytes, { contentType: blob.type || 'application/octet-stream', upsert: true });
  if (upErr) return skip(`copy failed: ${upErr.message}`);

  const { data: signed } = await supabase.storage.from(DEST_BUCKET).createSignedUrl(destPath, FIVE_YEARS);

  // Form 2290 is gated on staff review; registration has no Stage 2 review step.
  let pendingReview = false;
  if (documentType === 'form_2290') {
    const { data: status } = await supabase
      .from('onboarding_status')
      .select('form_2290')
      .eq('operator_id', operatorId)
      .maybeSingle();
    pendingReview = status?.form_2290 !== 'received';
  }

  const row = {
    file_url: signed?.signedUrl ?? null,
    file_path: destPath,
    uploaded_at: doc.uploaded_at ?? new Date().toISOString(),
    uploaded_by: actorId ?? operator.user_id,
    pending_review: pendingReview,
    source: 'onboarding_sync',
  };

  const res = existing?.id
    ? await supabase.from('inspection_documents').update(row).eq('id', existing.id)
    : await supabase.from('inspection_documents').insert({
        name: slot.name,
        scope: 'per_driver',
        driver_id: operator.user_id,
        expires_at: null,
        ...row,
      });

  if (res.error) {
    await supabase.storage.from(DEST_BUCKET).remove([destPath]);
    return skip(`binder write failed: ${res.error.message}`);
  }

  // Drop the superseded copy so the bucket doesn't accumulate orphans.
  if (existing?.file_path && existing.file_path !== destPath && existing.source === 'onboarding_sync') {
    await supabase.storage.from(DEST_BUCKET).remove([existing.file_path]);
  }

  return { operator_id: operatorId, document_type: documentType, status: 'synced' };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase } = auth;

  const body = await req.json().catch(() => null) as
    | { operator_id?: string; document_type?: string; backfill?: boolean }
    | null;

  const { data: staffRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner'])
    .limit(1)
    .maybeSingle();
  const isStaff = !!staffRow;

  // ── Backfill sweep (staff only) ───────────────────────────────────────────
  if (body?.backfill) {
    if (!isStaff) return fail(403, 'Forbidden: staff only');

    const { data: ops, error: opsErr } = await supabase
      .from('operators')
      .select('id, user_id, is_demo, account_status')
      .not('user_id', 'is', null);
    if (opsErr) return fail(500, 'Failed to load operators', opsErr.message);

    const eligible = (ops ?? []).filter(
      (o: any) => !o.is_demo && o.account_status !== 'inactive' && o.account_status !== 'denied',
    );

    const results: SyncResult[] = [];
    for (const op of eligible) {
      for (const type of Object.keys(SLOTS)) {
        results.push(await syncOne(supabase, op.id, type, userId));
      }
    }
    return ok({
      success: true,
      considered: eligible.length,
      synced: results.filter(r => r.status === 'synced').length,
      results: results.filter(r => r.status === 'synced'),
    });
  }

  // ── Single-document sync ──────────────────────────────────────────────────
  const operatorId = body?.operator_id?.trim();
  const documentType = body?.document_type?.trim();
  if (!operatorId || !documentType) {
    return fail(400, 'operator_id and document_type are required');
  }
  if (!SLOTS[documentType]) {
    return fail(400, `document_type must be one of: ${Object.keys(SLOTS).join(', ')}`);
  }

  if (!isStaff) {
    // Driver themself, or the truck owner for this unit
    const { data: operator } = await supabase
      .from('operators')
      .select('user_id')
      .eq('id', operatorId)
      .maybeSingle();
    let authorized = operator?.user_id === userId;
    if (!authorized) {
      const { data: owner } = await supabase
        .from('truck_owners')
        .select('id')
        .eq('operator_id', operatorId)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      authorized = !!owner;
    }
    if (!authorized) return fail(403, 'Forbidden: caller cannot sync this unit');
  }

  const result = await syncOne(supabase, operatorId, documentType, userId);
  return ok({ success: true, ...result });
}

Deno.serve(withErrorEnvelope(handler, 'sync-onboarding-doc-to-binder'));
