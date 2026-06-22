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

Deno.serve(async (req) => {
  // Always respond with the pixel — never reveal whether tracking succeeded.
  try {
    const url = new URL(req.url);
    const b = url.searchParams.get('b');
    const r = url.searchParams.get('r');
    const t = url.searchParams.get('t');
    if (b && r && t) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      // Match all three to prevent enumeration; only stamp first open.
      await supabase
        .from('operator_broadcast_recipients')
        .update({ opened_at: new Date().toISOString() })
        .eq('broadcast_id', b)
        .eq('id', r)
        .eq('track_token', t)
        .is('opened_at', null);
    }
  } catch (e) {
    console.error('broadcast-track-open error:', e);
  }
  return new Response(PIXEL, { status: 200, headers: pixelHeaders });
});