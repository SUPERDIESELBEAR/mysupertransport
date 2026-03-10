const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const pat = Deno.env.get('MGMT_API_ACCESS_TOKEN')!;

    // Extract project ref from URL
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password_hibp_enabled: true,
        }),
      }
    );

    const responseText = await response.text();
    let data: unknown;
    try { data = JSON.parse(responseText); } catch { data = responseText; }

    return new Response(JSON.stringify({ 
      status: response.status,
      ok: response.ok,
      data,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
