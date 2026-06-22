import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const broadcastId: string | undefined = body.broadcastId;
    const action: 'read' | 'acknowledge' = body.action === 'acknowledge' ? 'acknowledge' : 'read';
    if (!broadcastId) {
      return new Response(JSON.stringify({ error: 'broadcastId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the caller's operator row(s)
    const { data: ops } = await admin
      .from('operators')
      .select('id')
      .eq('user_id', userId);
    const operatorIds = (ops ?? []).map((o) => o.id);
    if (!operatorIds.length) {
      return new Response(JSON.stringify({ error: 'No operator profile' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const patch: Record<string, string> = { read_at: now };
    if (action === 'acknowledge') patch.acknowledged_at = now;

    // Only set read_at if null (preserve first-open time); always allow ack stamp once.
    if (action === 'read') {
      const { error } = await admin
        .from('operator_broadcast_recipients')
        .update({ read_at: now })
        .eq('broadcast_id', broadcastId)
        .in('operator_id', operatorIds)
        .is('read_at', null);
      if (error) throw error;
    } else {
      // Acknowledge: stamp ack (and read if not yet set)
      const { error } = await admin
        .from('operator_broadcast_recipients')
        .update(patch)
        .eq('broadcast_id', broadcastId)
        .in('operator_id', operatorIds);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('broadcast-acknowledge error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});