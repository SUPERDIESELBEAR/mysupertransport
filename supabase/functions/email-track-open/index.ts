import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1x1 transparent GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const pixelHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Access-Control-Allow-Origin': '*',
};

function b64url(bytes: ArrayBuffer): string {
  const b = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeToken(messageId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageId));
  return b64url(sig).slice(0, 16);
}

Deno.serve(async (req) => {
  // Always respond with the pixel — never reveal whether tracking succeeded.
  try {
    const url = new URL(req.url);
    const m = url.searchParams.get('m');
    const t = url.searchParams.get('t');
    const secret = Deno.env.get('EMAIL_TRACK_SECRET');
    if (m && t && secret) {
      const expected = await computeToken(m, secret);
      // constant-time-ish equality
      if (expected.length === t.length) {
        let diff = 0;
        for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ t.charCodeAt(i);
        if (diff === 0) {
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          );
          // Fetch current open_count, then bump and stamp opened_at on first hit.
          const { data: row } = await supabase
            .from('email_send_log')
            .select('id, opened_at, open_count')
            .eq('message_id', m)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (row) {
            await supabase
              .from('email_send_log')
              .update({
                opened_at: row.opened_at ?? new Date().toISOString(),
                open_count: (row.open_count ?? 0) + 1,
              })
              .eq('id', row.id);
          }
        }
      }
    }
  } catch (e) {
    console.error('email-track-open error:', e);
  }
  return new Response(PIXEL, { status: 200, headers: pixelHeaders });
});