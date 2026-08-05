// send-binder-share — emails roadside documents out of the driver inspection
// binder as a branded HTML message instead of a `mailto:` plain-text blob.
//
// Callers: drivers (own binder) and staff (any binder). Document titles and
// links are resolved server-side from `inspection_documents` so the client
// can't inject arbitrary content into an email sent from our domain.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAuthedUser, ok, fail, withErrorEnvelope, sendResendDirect, buildAppUrl } from '../_shared/email/index.ts';
import { binderShareHtml, binderShareText, binderShareSubject, type BinderShareDoc } from '../_shared/binder-share-email.ts';
import { canShareBinderDocument } from '../_shared/binder-share-auth.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_DOCS = 30;
const MAX_NOTE = 600;
/** A single short-link RPC must never stall the whole email. */
const SHORT_LINK_TIMEOUT_MS = 6000;

function withDeadline<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

interface ItemInput {
  token?: string | null;
  url?: string | null;
  title?: string | null;
}

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase, authHeader } = auth;
  const t0 = Date.now();
  console.log(`[send-binder-share] authed user=${userId}`);

  let body: {
    recipientEmail?: string;
    driverName?: string;
    unitNumber?: string | null;
    note?: string | null;
    items?: ItemInput[];
  };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Invalid JSON body');
  }

  const recipientEmail = (body.recipientEmail ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(recipientEmail)) {
    return fail(400, 'A valid recipient email address is required');
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return fail(400, 'At least one document is required');
  if (items.length > MAX_DOCS) return fail(400, `At most ${MAX_DOCS} documents can be shared at once`);
  const note = (body.note ?? '').trim().slice(0, MAX_NOTE) || null;

  // ── Caller scope ──────────────────────────────────────────────────────────
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['owner', 'management', 'onboarding_staff', 'dispatcher']);
  const isStaff = (roleRows ?? []).length > 0;

  if (!isStaff) {
    const { data: operator } = await supabase
      .from('operators')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!operator) {
      return fail(403, 'Forbidden: no binder is associated with this account');
    }
  }

  // ── Resolve + authorize each item ─────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const callerClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const docs: BinderShareDoc[] = [];
  let driverName = (body.driverName ?? '').trim();

  // ── 1. One batched lookup for every tokenized document ────────────────────
  const tokens = items
    .map((i) => (i.token ?? '').trim())
    .filter((t) => t.length > 0);

  const docByToken = new Map<string, { name: string; scope: string; driver_id: string | null; expires_at: string | null; pending_review: boolean }>();
  if (tokens.length > 0) {
    const { data: rows, error } = await supabase
      .from('inspection_documents')
      .select('name, scope, driver_id, expires_at, public_share_token, pending_review')
      .in('public_share_token', tokens);
    if (error) return fail(500, 'Failed to look up shared documents', error.message);
    for (const r of rows ?? []) {
      docByToken.set(r.public_share_token as string, {
        name: r.name as string,
        scope: r.scope as string,
        driver_id: (r.driver_id as string | null) ?? null,
        expires_at: (r.expires_at as string | null) ?? null,
        pending_review: (r.pending_review as boolean | null) === true,
      });
    }
    console.log(`[send-binder-share] resolved ${docByToken.size}/${tokens.length} documents in ${Date.now() - t0}ms`);
  }

  // ── 2. Short links in parallel, each with its own deadline ────────────────
  const shortLinks = new Map<string, string>();
  if (tokens.length > 0) {
    const results = await Promise.all(
      tokens.map((token) =>
        withDeadline(
          callerClient
            .rpc('get_or_create_short_link', { _share_token: token })
            .then(({ data }) => (typeof data === 'string' && data ? data : null)),
          SHORT_LINK_TIMEOUT_MS,
          null,
        ),
      ),
    );
    tokens.forEach((token, i) => {
      const code = results[i];
      if (code) shortLinks.set(token, code);
    });
    console.log(`[send-binder-share] short links ready (${shortLinks.size}/${tokens.length}) at ${Date.now() - t0}ms`);
  }

  // ── 3. Authorize + assemble ───────────────────────────────────────────────
  for (const item of items) {
    const token = (item.token ?? '').trim();
    if (token) {
      const doc = docByToken.get(token);
      if (!doc) return fail(404, 'One of the selected documents could not be found');

      // Synced-but-unverified uploads must not reach an officer.
      if (doc.pending_review) {
        return fail(409, `"${doc.name}" is still pending staff review and cannot be shared yet`);
      }

      if (!canShareBinderDocument({
        callerUserId: userId,
        isStaff,
        documentScope: doc.scope,
        documentDriverId: doc.driver_id,
      })) {
        return fail(403, 'Forbidden: one of the selected documents is not in your binder');
      }

      const code = shortLinks.get(token);
      docs.push({
        title: doc.name || item.title || 'Document',
        url: code ? buildAppUrl(`/s/${code}`) : buildAppUrl(`/inspect/${token}`),
        meta: doc.expires_at
          ? `Expires ${new Date(doc.expires_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}`
          : null,
      });
      continue;
    }

    // Tokenless item (driver upload): only accept our own storage links.
    const url = (item.url ?? '').trim();
    if (!url || !supabaseUrl || !url.startsWith(supabaseUrl)) {
      return fail(400, 'One of the selected documents has no shareable link');
    }
    docs.push({ title: (item.title ?? 'Uploaded Document').slice(0, 120), url, meta: null });
  }

  if (docs.length === 0) return fail(400, 'Nothing to share');
  if (!driverName) driverName = 'Driver';

  // ── 4. Bundle link: one URL that pages through every shared document ──────
  let bundleUrl: string | null = null;
  if (tokens.length > 1) {
    const { data: bundle, error: bundleErr } = await supabase
      .from('binder_share_bundles')
      .insert({
        created_by: userId,
        driver_name: driverName.slice(0, 120),
        unit_number: (body.unitNumber ?? null)?.toString().slice(0, 32) || null,
        doc_tokens: tokens,
      })
      .select('token')
      .single();
    if (bundleErr) {
      console.error(`[send-binder-share] bundle create failed: ${bundleErr.message}`);
    } else if (bundle?.token) {
      bundleUrl = buildAppUrl(`/inspect/all/${bundle.token}`);
    }
  }

  const input = {
    docs,
    driverName: driverName.slice(0, 120),
    unitNumber: (body.unitNumber ?? null)?.toString().slice(0, 32) || null,
    note,
    sharedAt: new Date(),
    bundleUrl,
  };

  const result = await sendResendDirect({
    supabase,
    role: 'operations',
    to: recipientEmail,
    subject: binderShareSubject(input),
    html: binderShareHtml(input),
    text: binderShareText(input),
    logLabel: 'binder_document_share',
    authHeader,
  });

  if (!result.success) {
    console.error(`[send-binder-share] send failed (${result.status}) after ${Date.now() - t0}ms: ${result.error}`);
    return fail(result.status >= 400 ? result.status : 502, result.error ?? 'Email send failed', result.details);
  }

  console.log(`[send-binder-share] sent ${docs.length} doc(s) in ${Date.now() - t0}ms`);
  return ok({ success: true, sent: docs.length, recipient: recipientEmail });
}, 'send-binder-share'));