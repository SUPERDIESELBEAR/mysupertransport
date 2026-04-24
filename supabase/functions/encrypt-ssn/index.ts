import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM encrypt
async function encryptSSN(ssn: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex.padEnd(64, '0').slice(0, 64));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(ssn);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(encoded),
  );
  // Store as base64(iv):base64(ciphertext)
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str.slice(0, 32).padEnd(32, '0'));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ssn } = await req.json();
    if (!ssn || typeof ssn !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid SSN' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawKey = Deno.env.get('SSN_ENCRYPTION_KEY') ?? '';
    // Convert string key to 32-byte (256-bit) key material via raw bytes
    const keyBytes = strToBytes(rawKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(ssn.replace(/\D/g, ''));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(encoded),
    );

    const encrypted = `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;

    return new Response(JSON.stringify({ encrypted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('encrypt-ssn error:', err);
    return new Response(JSON.stringify({ error: 'Encryption failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
