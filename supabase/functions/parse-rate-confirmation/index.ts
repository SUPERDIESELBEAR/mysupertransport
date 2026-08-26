// Parse a broker rate confirmation (PDF or image) with Lovable AI and return
// structured, confidence-tagged load data for the Create Load review screen.
// Staff-authenticated. The model never guesses money or times.
//
// This file is the HTTP surface ONLY: auth and request plumbing. Everything
// that decides what a document parses to lives in _shared/rateConCore.ts so
// the inbound email ingest function runs the identical parse in-process —
// without calling this endpoint, and without any shared secret that would
// make this public surface staff-equivalent.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { parseRateConfirmationCore, type ParseRequestBody } from '../_shared/rateConCore.ts';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json(500, { error: 'Missing LOVABLE_API_KEY' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: 'Unauthorized' });
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['dispatcher', 'management', 'owner'])
      .limit(1);
    if (!roles || roles.length === 0) return json(403, { error: 'Dispatch role required' });

    const body = (await req.json()) as ParseRequestBody;
    const outcome = await parseRateConfirmationCore(body, apiKey);
    return json(outcome.status, outcome.body);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('parse-rate-confirmation error', msg);
    return json(500, { error: msg });
  }
});
