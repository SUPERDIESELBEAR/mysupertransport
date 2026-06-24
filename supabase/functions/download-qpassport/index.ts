// Public, token-gated endpoint for an operator's QPassport PDF.
//
// Three modes (selected by the `mode` query param):
//   (none)       → HTML viewer page: renders the PDF inline in an <iframe>
//                  and auto-triggers a download of the same file. Header
//                  has manual "Download" and "Open My Portal" buttons.
//   inline       → PDF bytes with Content-Disposition: inline (used by
//                  the viewer iframe so the browser renders it natively).
//   attachment   → PDF bytes with Content-Disposition: attachment (used
//                  by the viewer's auto-download script and the header
//                  "Download" button).
//
// The token is `<payload>.<sig>` where:
//   payload = base64url(JSON.stringify({ o: operator_id, e: unix_exp_seconds }))
//   sig     = base64url(HMAC-SHA256(payload, SUPABASE_SERVICE_ROLE_KEY))
// The same secret is used to mint tokens in send-notification /
// send-test-email, so no extra secret is required.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SERVICE_ROLE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(sig))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null
  if (!url.startsWith('http')) return url
  for (const marker of [
    `/object/public/${bucket}/`,
    `/storage/v1/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ]) {
    const idx = url.indexOf(marker)
    if (idx !== -1) return url.slice(idx + marker.length).split('?')[0]
  }
  return null
}

function errorPage(title: string, message: string, status = 400): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0D0D;color:#fff;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
 .card{max-width:480px;text-align:center;background:#1a1a1a;padding:32px;border-radius:12px;border:1px solid #2a2a2a}
 h1{margin:0 0 12px;font-size:20px}
 p{color:#bdbdbd;line-height:1.5;margin:0 0 24px}
 a.btn{display:inline-block;background:#C9A84C;color:#0D0D0D;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>
<a class="btn" href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport">Open My Portal</a>
</div></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// Verify token, return operator_id or an error Response.
async function resolveToken(token: string | null): Promise<{ operatorId: string } | Response> {
  if (!token) return errorPage('Missing link token', 'This link is incomplete. Please open your portal to view your QPassport manually.', 400)
  const [payloadPart, sigPart] = token.split('.')
  if (!payloadPart || !sigPart) return errorPage('Invalid link', 'This link is malformed.', 400)
  const expectedSig = await hmacSign(payloadPart)
  if (!constantTimeEqual(expectedSig, sigPart)) {
    return errorPage('Invalid link', 'This link could not be verified.', 401)
  }
  let payload: { o?: string; e?: number }
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadPart)))
  } catch {
    return errorPage('Invalid link', 'This link is malformed.', 400)
  }
  const operatorId = payload.o
  const exp = payload.e
  if (!operatorId || !exp) return errorPage('Invalid link', 'This link is malformed.', 400)
  if (Date.now() / 1000 > exp) {
    return errorPage('Link expired', 'This link has expired. Please log in to your portal to view your QPassport.', 410)
  }
  return { operatorId }
}

// Fetch the QPassport PDF bytes for an operator. Returns bytes or an error Response.
async function fetchQPassportBytes(operatorId: string): Promise<Uint8Array | Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: row, error: rowErr } = await supabase
    .from('onboarding_status')
    .select('qpassport_url')
    .eq('operator_id', operatorId)
    .maybeSingle()
  if (rowErr || !row?.qpassport_url) {
    return errorPage('QPassport not available', 'We could not find a QPassport on file for your account. Please contact your onboarding coordinator.', 404)
  }
  const path = extractStoragePath(row.qpassport_url, 'operator-documents')
  if (!path) {
    return errorPage('QPassport not available', 'We could not locate your QPassport file. Please contact your onboarding coordinator.', 404)
  }
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from('operator-documents')
    .download(path)
  if (dlErr || !fileBlob) {
    return errorPage('Download failed', 'We could not retrieve your QPassport right now. Please try again or open your portal.', 500)
  }
  return new Uint8Array(await fileBlob.arrayBuffer())
}

function viewerPage(token: string): Response {
  // The iframe and auto-download both hit this same function with mode params.
  // Build relative URLs so this works on any host the function is reachable on.
  const inlineUrl = `?token=${encodeURIComponent(token)}&mode=inline`
  const attachmentUrl = `?token=${encodeURIComponent(token)}&mode=attachment`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>QPassport</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;padding:0;height:100%;background:#0D0D0D;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
 .wrap{display:flex;flex-direction:column;height:100vh}
 header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#1a1a1a;border-bottom:1px solid #2a2a2a;position:sticky;top:0;z-index:2}
 header .title{font-weight:600;font-size:15px;letter-spacing:.2px}
 header .actions{display:flex;gap:8px;flex-wrap:wrap}
 a.btn,button.btn{display:inline-block;background:#C9A84C;color:#0D0D0D;text-decoration:none;font-weight:600;padding:8px 14px;border-radius:6px;border:0;font-size:13px;cursor:pointer}
 a.btn.secondary{background:transparent;color:#C9A84C;border:1px solid #C9A84C}
 .viewer{flex:1;min-height:0;background:#0D0D0D}
 iframe{width:100%;height:100%;border:0;background:#0D0D0D}
</style></head>
<body>
 <div class="wrap">
  <header>
   <div class="title">QPassport</div>
   <div class="actions">
    <a class="btn" id="dl" href="${attachmentUrl}" download="QPassport.pdf">Download</a>
    <a class="btn secondary" href="https://mysupertransport.lovable.app/operator?tab=progress#qpassport">Open My Portal</a>
   </div>
  </header>
  <div class="viewer">
   <iframe src="${inlineUrl}" title="QPassport"></iframe>
  </div>
 </div>
 <script>
  // Auto-download a copy on load. Best-effort: some mobile browsers will
  // ignore the synthetic click; the header Download button is the fallback.
  try {
   var a = document.createElement('a');
   a.href = ${JSON.stringify(attachmentUrl)};
   a.download = 'QPassport.pdf';
   a.rel = 'noopener';
   document.body.appendChild(a);
   setTimeout(function(){ try { a.click(); } catch(_){} a.remove(); }, 300);
  } catch (_) {}
 </script>
</body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function pdfResponse(bytes: Uint8Array, mode: 'inline' | 'attachment'): Response {
  const disposition = mode === 'attachment'
    ? 'attachment; filename="QPassport.pdf"'
    : 'inline; filename="QPassport.pdf"'
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const mode = url.searchParams.get('mode') // 'inline' | 'attachment' | null

    const resolved = await resolveToken(token)
    if (resolved instanceof Response) return resolved
    const { operatorId } = resolved

    // Default (no mode) → HTML viewer page that the email link points to.
    if (mode !== 'inline' && mode !== 'attachment') {
      return viewerPage(token!)
    }

    // Inline or attachment → stream PDF bytes.
    const bytesOrErr = await fetchQPassportBytes(operatorId)
    if (bytesOrErr instanceof Response) return bytesOrErr
    return pdfResponse(bytesOrErr, mode)
  } catch (err) {
    console.error('[download-qpassport] error:', err)
    return errorPage('Something went wrong', 'An unexpected error occurred. Please open your portal to download your QPassport.', 500)
  }
})