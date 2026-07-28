import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildAppUrl } from '../_shared/app-url.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CODE_TTL_MS = 3 * 60 * 1000;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) return json({ error: 'Unauthorized' }, 401);

    // Only management / owner may start a preview session.
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['management', 'owner'])
      .limit(1);
    if (!callerRoles || callerRoles.length === 0) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body?.target_user_id === 'string' ? body.target_user_id.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return json({ error: 'target_user_id is required' }, 400);
    }
    if (targetUserId === callerId) {
      return json({ error: 'You are already signed in as this account.' }, 400);
    }

    // Target must be an operator.
    const { data: targetRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId);
    const roles = (targetRoles ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes('operator')) {
      return json({ error: 'Preview is only available for driver accounts.' }, 400);
    }
    if (roles.includes('owner')) {
      return json({ error: 'Owner accounts cannot be previewed.' }, 403);
    }

    const { data: targetAuth, error: targetErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (targetErr || !targetAuth?.user?.email) {
      return json({ error: 'Driver account has no email on file.' }, 400);
    }

    // Revoke any outstanding unused codes for this driver so only one QR is live.
    await supabaseAdmin
      .from('preview_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('target_user_id', targetUserId)
      .is('used_at', null)
      .is('revoked_at', null);

    const code = randomCode();
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error: insertErr } = await supabaseAdmin.from('preview_sessions').insert({
      code_hash: codeHash,
      target_user_id: targetUserId,
      created_by: callerId,
      expires_at: expiresAt,
    });
    if (insertErr) {
      console.error('preview_sessions insert failed:', insertErr.message);
      return json({ error: 'Could not create preview session.' }, 500);
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerId)
      .maybeSingle();
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const targetName =
      `${targetProfile?.first_name ?? ''} ${targetProfile?.last_name ?? ''}`.trim() ||
      targetAuth.user.email;

    await supabaseAdmin.from('audit_log').insert({
      action: 'preview_session_created',
      actor_name: `${callerProfile?.first_name ?? ''} ${callerProfile?.last_name ?? ''}`.trim() || null,
      entity_type: 'operator',
      entity_label: targetName,
      metadata: { target_user_id: targetUserId, created_by: callerId, expires_at: expiresAt },
    });

    const url = `${new URL(buildAppUrl('/')).origin}/preview-login?c=${code}`;

    return json({ success: true, url, code, expires_at: expiresAt, target_name: targetName });
  } catch (err) {
    console.error('create-preview-session error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
