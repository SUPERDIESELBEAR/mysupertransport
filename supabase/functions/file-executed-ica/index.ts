// file-executed-ica
//
// Files a fully executed ICA (rendered client-side to PDF) into the DRIVER's
// DOT inspection binder under the "Lease Agreement (ICA)" slot.
//
// Why server-side: when a truck owner signs on behalf of a driver, the owner
// has no RLS rights to write the driver's binder row or storage object. This
// function validates the caller's JWT, proves the caller is the signer for
// that unit (driver themself or the linked truck owner), then writes with the
// service role.
import { preflight, ok, fail, withErrorEnvelope, requireAuthedUser } from '../_shared/email/index.ts';

const BUCKET = 'inspection-documents';
const SLOT_NAME = 'Lease Agreement (ICA)';
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',').pop()! : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase } = auth;

  const body = await req.json().catch(() => null) as
    | { operator_id?: string; contract_id?: string; pdf_base64?: string }
    | null;
  const operatorId = body?.operator_id?.trim();
  const contractId = body?.contract_id?.trim();
  const pdfBase64 = body?.pdf_base64;

  if (!operatorId || !contractId || !pdfBase64) {
    return fail(400, 'operator_id, contract_id and pdf_base64 are required');
  }
  if (pdfBase64.length > 30_000_000) {
    return fail(400, 'PDF too large');
  }

  // ── Resolve the unit + driver ────────────────────────────────────────────
  const { data: operator, error: opErr } = await supabase
    .from('operators')
    .select('id, user_id')
    .eq('id', operatorId)
    .maybeSingle();
  if (opErr) return fail(500, 'Failed to load operator', opErr.message);
  if (!operator?.user_id) return fail(404, 'Operator not found');

  // ── Authorize: caller is the driver, or the truck owner for this unit ────
  let authorized = operator.user_id === userId;
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
  if (!authorized) return fail(403, 'Forbidden: caller is not a signer for this unit');

  // ── Only file agreements that are actually executed ──────────────────────
  const { data: contract } = await supabase
    .from('ica_contracts')
    .select('id, status, operator_id, contractor_signed_at')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract || contract.operator_id !== operatorId) return fail(404, 'ICA not found for this unit');
  if (!contract.contractor_signed_at) return fail(409, 'ICA is not fully executed yet');

  // ── Upload PDF ───────────────────────────────────────────────────────────
  const bytes = decodeBase64(pdfBase64);
  const path = `driver/${operator.user_id}/lease-agreement-ica/${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) return fail(500, 'Failed to store executed ICA', upErr.message);

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, FIVE_YEARS);
  const fileUrl = signed?.signedUrl ?? null;

  // ── Upsert the binder slot (staff can still replace it later) ────────────
  const { data: existing } = await supabase
    .from('inspection_documents')
    .select('id')
    .eq('scope', 'per_driver')
    .eq('driver_id', operator.user_id)
    .eq('name', SLOT_NAME)
    .limit(1)
    .maybeSingle();

  const row = {
    file_url: fileUrl,
    file_path: path,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
  };

  const dbRes = existing?.id
    ? await supabase.from('inspection_documents').update(row).eq('id', existing.id)
    : await supabase.from('inspection_documents').insert({
        name: SLOT_NAME,
        scope: 'per_driver',
        driver_id: operator.user_id,
        ...row,
      });

  if (dbRes.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return fail(500, 'Failed to file executed ICA in binder', dbRes.error.message);
  }

  return ok({ success: true, file_path: path, file_url: fileUrl });
}

Deno.serve(withErrorEnvelope(handler, 'file-executed-ica'));