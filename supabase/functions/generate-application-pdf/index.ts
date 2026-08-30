/**
 * generate-application-pdf
 *
 * Renders a submitted driver application to a branded, text-selectable PDF and
 * returns a short-lived signed URL.
 *
 * Server-rendered rather than printed from the browser because this document
 * is a compliance artifact: it must look identical no matter who generated it,
 * on which browser, at which zoom level, and it must still be searchable text
 * when someone opens it in five years. Browser print remains in the UI as a
 * fallback for when this function is unreachable.
 *
 * Access is staff-only. An application contains a date of birth, a licence
 * number, and a residence history; there is no token path into this endpoint.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildApplicationDocument, applicationPdfFilename, applicantName } from '../_shared/application/documentModel.ts';
import { identityFromProfile } from '../_shared/application/identity.ts';
import { renderApplicationPdf } from '../_shared/application/renderPdf.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAFF_ROLES = ['onboarding_staff', 'management', 'owner'] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * signature_image_url may be a full URL, a bare storage key, or — for the
 * overwhelming majority of historical rows — a key that repeats the bucket
 * name (`signatures/<uuid>/<file>.png` inside the `signatures` bucket).
 *
 * The stored value is therefore tried verbatim FIRST. Stripping the prefix up
 * front is what produced blank signature lines on every generated PDF.
 */
function storagePathCandidates(url: string, bucket: string): string[] {
  if (!url) return [];
  if (!/^https?:\/\//i.test(url)) {
    const stripped = url.replace(new RegExp(`^${bucket}/`), '');
    return stripped === url ? [url] : [url, stripped];
  }
  for (const marker of [`/object/public/${bucket}/`, `/object/sign/${bucket}/`, `/object/${bucket}/`]) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const key = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
      const stripped = key.replace(new RegExp(`^${bucket}/`), '');
      return stripped === key ? [key] : [key, stripped];
    }
  }
  return [];
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // getClaims, not the gateway: the gateway does not carry the caller's
    // identity through when verify_jwt is relaxed for other functions.
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await asUser.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (authError || !userId) return json({ error: 'Unauthorized' }, 401);

    const { data: roleRows, error: roleError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', STAFF_ROLES as unknown as string[])
      .limit(1);
    if (roleError) return json({ error: 'Role check failed' }, 500);
    if (!roleRows || roleRows.length === 0) {
      return json({ error: 'Forbidden: staff role required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = body?.application_id as string | undefined;
    if (!applicationId) return json({ error: 'application_id required' }, 400);

    const { data: app, error: appError } = await admin
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError) return json({ error: appError.message }, 500);
    if (!app) return json({ error: 'Application not found' }, 404);

    const { data: profile } = await admin
      .from('carrier_profile')
      .select('legal_name, usdot_number, mc_number')
      .limit(1)
      .maybeSingle();
    const identity = identityFromProfile(profile);

    // The drawn signature lives in a private bucket; pull the bytes directly
    // rather than embedding a URL the PDF reader would have to resolve.
    let signatureBytes: Uint8Array | null = null;
    let signatureMime: string | null = null;
    const storedSignature = String(app.signature_image_url ?? '').trim();
    const sigCandidates = storagePathCandidates(storedSignature, 'signatures');
    let sigLastError: string | null = null;
    for (const candidate of sigCandidates) {
      const { data: blob, error: sigError } = await admin.storage.from('signatures').download(candidate);
      if (!sigError && blob) {
        signatureBytes = new Uint8Array(await blob.arrayBuffer());
        signatureMime = blob.type || 'image/png';
        break;
      }
      sigLastError = sigError?.message ?? 'not found';
    }
    // A signature on file that cannot be read must fail loudly: a compliance
    // document that silently prints a blank signature line is worse than none.
    if (storedSignature && !signatureBytes) {
      console.error('signature download failed', { applicationId, sigCandidates, sigLastError });
      return json(
        { error: 'The applicant signature image could not be retrieved, so the document was not generated.' },
        502,
      );
    }


    const model = buildApplicationDocument(app);
    const pdfBytes = await renderApplicationPdf(model, { identity, signatureBytes, signatureMime });

    const filename = applicationPdfFilename(app);
    const objectPath = `generated/${applicationId}/${Date.now()}_${filename}`;
    const { error: uploadError } = await admin.storage
      .from('application-documents')
      .upload(objectPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) return json({ error: `Upload failed: ${uploadError.message}` }, 500);

    const { data: signed, error: signError } = await admin.storage
      .from('application-documents')
      .createSignedUrl(objectPath, 600);
    if (signError || !signed?.signedUrl) {
      return json({ error: 'Could not sign the generated document' }, 500);
    }

    // Attribution is required for anything that renders personal data, but a
    // logging failure must not deny staff the document they just generated.
    const { data: actorProfile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle();
    await admin.from('audit_log').insert({
      action: 'application_pdf_generated',
      entity_type: 'application',
      entity_id: applicationId,
      entity_label: applicantName(app),
      actor_id: userId,
      actor_name: [actorProfile?.first_name, actorProfile?.last_name].filter(Boolean).join(' ') || null,
      metadata: { path: objectPath, byte_size: pdfBytes.byteLength },
    }).then(undefined, () => undefined);

    return json({
      url: signed.signedUrl,
      path: objectPath,
      filename,
      byte_size: pdfBytes.byteLength,
    });
  } catch (err) {
    console.error('generate-application-pdf failed', err);
    return json({ error: (err as Error)?.message ?? 'Unexpected error' }, 500);
  }
});
