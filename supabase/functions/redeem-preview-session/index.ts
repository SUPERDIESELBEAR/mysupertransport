import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!/^[0-9a-f]{64}$/i.test(code)) {
      return json({ error: 'This preview link is not valid.' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const codeHash = await sha256(code);
    const { data: sessionRow } = await supabaseAdmin
      .from('preview_sessions')
      .select('id, target_user_id, created_by, expires_at, used_at, revoked_at')
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (!sessionRow) return json({ error: 'This preview link is not valid.' }, 404);
    if (sessionRow.revoked_at) return json({ error: 'This preview link was replaced by a newer one.' }, 410);
    if (sessionRow.used_at) return json({ error: 'This preview link has already been used.' }, 410);
    if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
      return json({ error: 'This preview link has expired. Ask staff for a new code.' }, 410);
    }

    // Burn the code before minting the session so it can never be replayed.
    const { data: burned } = await supabaseAdmin
      .from('preview_sessions')
      .update({ used_at: new Date().toISOString() })
      .eq('id', sessionRow.id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id');
    if (!burned || burned.length === 0) {
      return json({ error: 'This preview link has already been used.' }, 410);
    }

    const { data: targetAuth, error: targetErr } = await supabaseAdmin.auth.admin.getUserById(
      sessionRow.target_user_id
    );
    if (targetErr || !targetAuth?.user?.email) {
      return json({ error: 'Driver account is unavailable.' }, 400);
    }

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetAuth.user.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('generateLink failed:', linkErr?.message ?? 'no hashed_token');
      return json({ error: 'Could not start the preview session.' }, 500);
    }

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', sessionRow.target_user_id)
      .maybeSingle();
    const targetName =
      `${targetProfile?.first_name ?? ''} ${targetProfile?.last_name ?? ''}`.trim() ||
      targetAuth.user.email;

    await supabaseAdmin.from('audit_log').insert({
      action: 'preview_session_redeemed',
      entity_type: 'operator',
      entity_label: targetName,
      metadata: {
        target_user_id: sessionRow.target_user_id,
        created_by: sessionRow.created_by,
        preview_session_id: sessionRow.id,
      },
    });

    return json({
      success: true,
      token_hash: linkData.properties.hashed_token,
      target_name: targetName,
    });
  } catch (err) {
    console.error('redeem-preview-session error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
