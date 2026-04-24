import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str.slice(0, 32).padEnd(32, '0'));
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to check roles securely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the requesting user via getClaims (compatible with signing-keys)
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseUser.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    // Gate: only management role may decrypt
    const { data: hasRole } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'management',
    });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Forbidden: management role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the encrypted SSN
    const { data: app, error: fetchError } = await supabaseAdmin
      .from('applications')
      .select('ssn_encrypted')
      .eq('id', application_id)
      .single();

    if (fetchError || !app?.ssn_encrypted) {
      return new Response(JSON.stringify({ error: 'Application not found or no SSN on file' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawKey = Deno.env.get('SSN_ENCRYPTION_KEY') ?? '';
    const keyBytes = strToBytes(rawKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']
    );

    const [ivB64, ciphertextB64] = app.ssn_encrypted.split(':');

    // Support legacy plain-text base64 (old btoa entries) gracefully
    if (!ciphertextB64) {
      // This is a legacy btoa-encoded value — return it decoded but flagged
      let legacy = '';
      try { legacy = atob(app.ssn_encrypted); } catch { legacy = app.ssn_encrypted; }
      return new Response(JSON.stringify({ ssn: legacy, legacy: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(ciphertextB64);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
    const ssn = new TextDecoder().decode(decrypted);

    // Log the decryption for audit
    await supabaseAdmin.from('audit_log').insert({
      entity_type: 'application',
      entity_id: application_id,
      entity_label: 'SSN Reveal',
      action: 'ssn_decrypted',
      actor_id: user.id,
    });

    return new Response(JSON.stringify({ ssn }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('decrypt-ssn error:', err);
    return new Response(JSON.stringify({ error: 'Decryption failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
