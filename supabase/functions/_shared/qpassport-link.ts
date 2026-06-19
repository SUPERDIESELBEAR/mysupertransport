// Mint a short-lived signed download link for an operator's QPassport.
// The matching verifier lives in supabase/functions/download-qpassport.
// We sign with SUPABASE_SERVICE_ROLE_KEY so no extra secret is required.

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(sig))
}

export async function buildQPassportDownloadUrl(
  operatorId: string,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 60 * 60 * 24 * 30) // 30 days
  const payloadJson = JSON.stringify({ o: operatorId, e: exp })
  const payload = b64urlEncode(new TextEncoder().encode(payloadJson))
  const sig = await hmacSign(payload, secret)
  return `${supabaseUrl}/functions/v1/download-qpassport?token=${payload}.${sig}`
}