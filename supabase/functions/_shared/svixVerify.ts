// Minimal Svix webhook signature verification, covering what Resend's inbound
// (`email.received`) webhooks use. Standard Webhooks scheme:
//   signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
//   signature:      base64(HMAC-SHA256(secret, signed content))
//   header:         "v1,<sig> v1,<sig2> ..." (any may match)
// The Resend dashboard secret is `whsec_` + base64; the prefix is stripped
// before decoding. A 5-minute timestamp tolerance rejects replays.

const TOLERANCE_SECONDS = 300;

export interface SvixVerification {
  ok: boolean;
  error?: string;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function decodeSecret(secret: string): Uint8Array {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  // Svix secrets are unpadded base64; atob tolerates that after re-padding.
  const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySvixSignature(
  rawBody: string,
  headers: Pick<Headers, 'get'>,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<SvixVerification> {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, error: 'Missing svix-id, svix-timestamp or svix-signature header' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    return { ok: false, error: 'Webhook timestamp outside tolerance' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    decodeSecret(secret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));

  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    try {
      const bin = atob(sig);
      const candidate = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) candidate[i] = bin.charCodeAt(i);
      if (bytesEqual(candidate, expected)) return { ok: true };
    } catch {
      // Malformed base64 signature entry — keep checking the rest.
    }
  }
  return { ok: false, error: 'No matching signature' };
}
