// Public token-gated endpoint for an applicant to approve or reject a staff
// correction request. Captures IP + user-agent server-side from request
// headers, then calls the appropriate SECURITY DEFINER RPC.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) { const f = xff.split(',')[0]?.trim(); if (f) return f; }
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body: {
    token?: string; action?: 'approve' | 'reject';
    signed_name?: string; signature_url?: string; rejection_reason?: string;
  };
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const token = (body.token || '').trim();
  const action = body.action;
  if (!token || (action !== 'approve' && action !== 'reject')) return json(400, { error: 'invalid_input' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const meta = {
    signed_ip: clientIp(req),
    signed_user_agent: req.headers.get('user-agent') || null,
  };

  if (action === 'approve') {
    const signedName = (body.signed_name || '').trim();
    const signatureUrl = (body.signature_url || '').trim();
    if (signedName.length < 2) return json(400, { error: 'signature_required' });

    const { data, error } = await supabase.rpc('approve_application_correction', {
      p_token: token,
      p_signed_name: signedName,
      p_signature_url: signatureUrl || null,
      p_meta: meta,
    });
    if (error) {
      console.error('[respond-application-correction] approve error', error);
      return json(400, { error: error.message || 'approve_failed' });
    }
    return json(200, { ok: true, data });
  }

  const reason = (body.rejection_reason || '').trim();
  const { data, error } = await supabase.rpc('reject_application_correction', {
    p_token: token,
    p_reason: reason || null,
    p_meta: meta,
  });
  if (error) {
    console.error('[respond-application-correction] reject error', error);
    return json(400, { error: error.message || 'reject_failed' });
  }
  return json(200, { ok: true, data });
});