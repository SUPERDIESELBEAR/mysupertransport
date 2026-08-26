// Inbound rate-confirmation intake. Resend delivers `email.received` webhooks
// for mail arriving at the dedicated parse@<inbound subdomain> address; this
// function verifies the Svix signature, stores the PDF in the private
// rate-con-ingest bucket, parses it IN-PROCESS through _shared/rateConCore.ts
// (the same core the manual upload path serves), extracts the text layer with
// the same pdfjs version the browser uses, and runs verbatim verification +
// adoption server-side before landing a row in rate_con_ingest_queue.
//
// Deliberate behavior:
//   - EVERY email creates a queue item, including junk and attachment-less
//     mail (portal links). A dispatcher dismisses those in one click; a
//     silently dropped email reads as "never sent".
//   - Redelivered webhooks collapse on resend_email_id; the same rate con
//     forwarded twice collapses on the attachment hash.
//   - The queue is shared — no routing, no claiming. The sidebar badge is the
//     only notification.
//   - A queue item whose broker reference matches a manually-created load is
//     auto-handled (DB trigger), and the same check runs here after parsing.
//   - Processing continues after the 200 via waitUntil so Resend's delivery
//     timeout cannot kill a parse.
//
// Secrets: RESEND_API_KEY (existing outbound key, also authenticates the
// inbound content/attachment fetches), RESEND_WEBHOOK_SECRET (whsec_... from
// the Resend webhook), RATE_CON_INGEST_ADDRESS (optional recipient allowlist).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { verifySvixSignature } from '../_shared/svixVerify.ts';
import { parseRateConfirmationCore } from '../_shared/rateConCore.ts';
import { extractPdfTextLayerDeno } from '../_shared/pdfTextLayerDeno.ts';
import { judgeParsedVerbatimServer } from '../_shared/verbatimIngest.ts';

const BUCKET = 'rate-con-ingest';
const RESEND_API = 'https://api.resend.com';
// Rate-cons exceed the 8 MB browser path regularly; inbound allows more, but
// a bounded download keeps a pathological attachment from stalling the worker.
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 2 * 60 * 1000;
const STALE_PENDING_MS = 10 * 60 * 1000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Alphanumeric normalization — the same key the duplicate-reference check uses. */
function normalizeReference(v: string): string {
  return v.toLowerCase().replace(/[^0-9a-z]/g, '');
}

interface InboundAttachmentMeta {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  download_url?: string;
}

interface QueueFinishOptions {
  onlyWhileProcessing?: boolean;
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function updateQueue(
  admin: AdminClient,
  queueId: string,
  patch: Record<string, unknown>,
  options: QueueFinishOptions = {},
): Promise<void> {
  let q = admin
    .from('rate_con_ingest_queue')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', queueId);
  if (options.onlyWhileProcessing) {
    q = q.in('status', ['received', 'pending_parse']);
  }
  const { error } = await q;
  if (error) throw new Error(`Queue update failed: ${error.message}`);
}

async function markFailed(
  admin: AdminClient,
  queueId: string,
  message: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await updateQueue(admin, queueId, {
      ...extra,
      status: 'needs_manual',
      parse_status: 'failed',
      parse_error: message,
    }, { onlyWhileProcessing: true });
  } catch (err) {
    console.error('queue failure update failed:', err instanceof Error ? err.message : String(err));
  }
}

async function markStalePendingRows(admin: AdminClient): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { error } = await admin
    .from('rate_con_ingest_queue')
    .update({
      status: 'needs_manual',
      parse_status: 'failed',
      parse_error: 'Parsing timed out after 10 minutes. Retry parsing or upload the rate confirmation manually.',
      updated_at: new Date().toISOString(),
    })
    .in('status', ['received', 'pending_parse'])
    .lt('updated_at', cutoff);
  if (error) console.error('stale ingest timeout sweep failed:', error.message);
}

async function withProcessingTimeout(
  admin: AdminClient,
  queueId: string,
  task: Promise<void>,
): Promise<void> {
  let finished = false;
  let timeoutId: number | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(async () => {
      if (!finished) {
        await markFailed(
          admin,
          queueId,
          'Parsing timed out after 2 minutes. Retry parsing or upload the rate confirmation manually.',
        );
      }
      resolve();
    }, PARSE_TIMEOUT_MS);
  });

  await Promise.race([
    task.finally(() => {
      finished = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }),
    timeout,
  ]);
}

async function resendGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${RESEND_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function assertDispatchStaff(req: Request, admin: AdminClient): Promise<string | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: 'Unauthorized' });
  const userId = claimsData.claims.sub as string;

  const { data: roles, error: rolesErr } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['dispatcher', 'management', 'owner'])
    .limit(1);
  if (rolesErr) return json(500, { error: 'Role check failed' });
  if (!roles || roles.length === 0) return json(403, { error: 'Dispatch role required' });
  return userId;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!webhookSecret) return json(500, { error: 'Missing RESEND_WEBHOOK_SECRET' });
    if (!resendApiKey) return json(500, { error: 'Missing RESEND_API_KEY' });
    if (!lovableApiKey) return json(500, { error: 'Missing LOVABLE_API_KEY' });

    const rawBody = await req.text();
    let parsedRequest: Record<string, unknown> | null = null;
    try {
      parsedRequest = JSON.parse(rawBody) as Record<string, unknown>;
    } catch { /* webhook validation below will return the right error */ }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await markStalePendingRows(admin);

    if (parsedRequest?.action === 'retry' && typeof parsedRequest.queue_id === 'string') {
      const actor = await assertDispatchStaff(req, admin);
      if (actor instanceof Response) return actor;
      const processing = withProcessingTimeout(
        admin,
        parsedRequest.queue_id,
        retryQueueItem(admin, {
          queueId: parsedRequest.queue_id,
          lovableApiKey,
          requestedBy: actor,
        }),
      ).catch((err) => {
        console.error('ingest retry failed:', err instanceof Error ? err.message : String(err));
      });
      // deno-lint-ignore no-explicit-any
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(processing);
      else await processing;
      return json(200, { id: parsedRequest.queue_id, retry: true });
    }

    const verification = await verifySvixSignature(rawBody, req.headers, webhookSecret);
    if (!verification.ok) {
      console.warn('receive-rate-con-email rejected:', verification.error);
      return json(401, { error: 'Invalid signature' });
    }

    let event: {
      type?: string;
      data?: {
        email_id?: string;
        from?: string;
        to?: string[];
        subject?: string;
        attachments?: InboundAttachmentMeta[];
      };
    };
    try {
      event = parsedRequest as typeof event;
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }

    if (event.type !== 'email.received' || !event.data?.email_id) {
      // Not ours — acknowledge so Resend stops redelivering.
      return json(200, { ignored: true, type: event.type ?? null });
    }

    const { email_id: emailId, from: fromAddress, to, subject } = event.data;
    const toAddresses = Array.isArray(to) ? to : to ? [String(to)] : [];
    const toAddress = toAddresses.join(', ') || null;

    // Dedicated-address allowlist: only mail sent to the ingest address is
    // accepted; anything else lands as a needs_manual item for one-click
    // dismissal rather than being dropped silently.
    const ingestAddress = (Deno.env.get('RATE_CON_INGEST_ADDRESS') ?? '').toLowerCase();
    const senderAllowed = !ingestAddress ||
      toAddresses.some((addr) => addr.toLowerCase().includes(ingestAddress));

    // Idempotency: a redelivered webhook collapses on resend_email_id.
    const { data: existing } = await admin
      .from('rate_con_ingest_queue')
      .select('id')
      .eq('resend_email_id', emailId)
      .maybeSingle();
    if (existing) return json(200, { duplicate: true, id: existing.id });

    const { data: row, error: insertErr } = await admin
      .from('rate_con_ingest_queue')
      .insert({
        resend_email_id: emailId,
        from_address: fromAddress ?? null,
        to_address: toAddress,
        subject: subject ?? null,
        sender_allowed: senderAllowed,
        status: 'pending_parse',
      })
      .select('id')
      .single();
    if (insertErr) {
      if (insertErr.code === '23505') return json(200, { duplicate: true });
      console.error('queue insert failed:', insertErr.message);
      return json(500, { error: 'Queue insert failed' });
    }
    const queueId = row.id as string;

    // Acknowledge immediately; the parse continues past the response so
    // Resend's delivery timeout cannot kill it.
    const processing = withProcessingTimeout(admin, queueId, processEmail(admin, {
      queueId,
      emailId,
      resendApiKey,
      lovableApiKey,
      senderAllowed,
      eventAttachments: event.data.attachments ?? [],
    })).catch((err) => {
      console.error('ingest processing failed:', err instanceof Error ? err.message : String(err));
      void markFailed(admin, queueId, err instanceof Error ? err.message : String(err));
    });
    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(processing);
    else await processing;

    return json(200, { id: queueId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('receive-rate-con-email error', msg);
    return json(500, { error: msg });
  }
});

interface ProcessArgs {
  queueId: string;
  emailId: string;
  resendApiKey: string;
  lovableApiKey: string;
  senderAllowed: boolean;
  eventAttachments: InboundAttachmentMeta[];
}

interface StoredAttachmentArgs {
  queueId: string;
  lovableApiKey: string;
  senderAllowed: boolean;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  storagePath: string;
  sha256: string;
}

interface RetryArgs {
  queueId: string;
  lovableApiKey: string;
  requestedBy: string;
}

// deno-lint-ignore no-explicit-any
async function processEmail(admin: AdminClient, args: ProcessArgs): Promise<void> {
  const { queueId, emailId, resendApiKey, lovableApiKey, senderAllowed } = args;

  const finish = async (patch: Record<string, unknown>) => {
    await updateQueue(admin, queueId, patch, { onlyWhileProcessing: true });
  };

  try {

  // Fetch the full inbound email; attachments carry download URLs.
  let email: {
    attachments?: InboundAttachmentMeta[];
  } = { attachments: args.eventAttachments };
  try {
    const res = await resendGet(`/emails/receiving/${emailId}`, resendApiKey);
    if (res.ok) {
      const full = await res.json();
      if (Array.isArray(full?.attachments) && full.attachments.length > 0) {
        email = full;
      }
    } else {
      console.error('inbound email fetch failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('inbound email fetch threw:', err instanceof Error ? err.message : String(err));
  }

  const attachments = email.attachments ?? [];
  // Prefer the first PDF; fall back to the first parseable image.
  const chosen = attachments.find((a) =>
    (a.content_type ?? '').toLowerCase().includes('pdf') ||
    (a.filename ?? '').toLowerCase().endsWith('.pdf')
  ) ?? attachments.find((a) => (a.content_type ?? '').toLowerCase().startsWith('image/'));

  if (!chosen) {
    await finish({
      status: 'needs_manual',
      parse_status: 'not_attempted',
      parse_error: 'No PDF attachment — retrieve the rate con manually (the broker may have sent a portal link).',
    });
    return;
  }

  // Resolve the download URL: present on the attachment, or via the
  // per-attachment endpoint.
  let downloadUrl = chosen.download_url ?? null;
  if (!downloadUrl && chosen.id) {
    try {
      const meta = await resendGet(`/emails/receiving/${emailId}/attachments/${chosen.id}`, resendApiKey);
      if (meta.ok) downloadUrl = (await meta.json())?.download_url ?? null;
    } catch { /* handled by the missing-URL branch below */ }
  }
  if (!downloadUrl) {
    await finish({
      status: 'needs_manual',
      parse_status: 'not_attempted',
      attachment_filename: chosen.filename ?? null,
      attachment_mime_type: chosen.content_type ?? null,
      parse_error: 'Attachment present but no download URL — retrieve manually.',
    });
    return;
  }

  const dl = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${resendApiKey}` } });
  if (!dl.ok) {
    await finish({
      status: 'needs_manual',
      parse_status: 'not_attempted',
      attachment_filename: chosen.filename ?? null,
      attachment_mime_type: chosen.content_type ?? null,
      parse_error: `Attachment download failed (HTTP ${dl.status}) — retrieve manually.`,
    });
    return;
  }
  const bytes = new Uint8Array(await dl.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    await finish({
      status: 'needs_manual',
      parse_status: 'not_attempted',
      attachment_filename: chosen.filename ?? null,
      attachment_mime_type: chosen.content_type ?? null,
      attachment_bytes: bytes.byteLength,
      parse_error: `Attachment unusable (${bytes.byteLength} bytes) — retrieve manually.`,
    });
    return;
  }

  const sha256 = await sha256Hex(bytes);

  // Same rate con forwarded twice (or copied to a second dispatcher) collapses
  // to the existing item. Auto-handled/converted/dismissed items do not block
  // a re-ingest — a revised rate con shares the filename but not the bytes.
  const { data: prior } = await admin
    .from('rate_con_ingest_queue')
    .select('id, status')
    .eq('attachment_sha256', sha256)
    .in('status', ['received', 'pending_parse', 'parsed', 'needs_manual'])
    .neq('id', queueId)
    .limit(1)
    .maybeSingle();
  if (prior) {
    // NOTE: attachment_sha256 is deliberately NOT written here — the partial
    // unique index on that column would reject this update while the original
    // item holds the same hash.
    await finish({
      status: 'dismissed',
      parse_status: 'not_attempted',
      dismiss_reason: `Duplicate of queue item ${prior.id} (identical attachment).`,
      dismissed_at: new Date().toISOString(),
    });
    return;
  }

  // Store the attachment in the private bucket; the inbox opens it via signed
  // URL, and the manual-path handoff reads it from here.
  const filename = chosen.filename ?? 'rate-con.pdf';
  const mimeType = chosen.content_type ?? 'application/pdf';
  const storagePath = `inbound/${new Date().toISOString().slice(0, 10)}/${queueId}/${filename.replace(/[^\w.\- ]/g, '_')}`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadErr) {
    await finish({
      status: 'needs_manual',
      parse_status: 'not_attempted',
      attachment_filename: filename,
      attachment_mime_type: mimeType,
      attachment_bytes: bytes.byteLength,
      attachment_sha256: sha256,
      parse_error: `Storage upload failed: ${uploadErr.message}`,
    });
    return;
  }

  await processStoredAttachment(admin, {
    queueId,
    lovableApiKey,
    senderAllowed,
    filename,
    mimeType,
    bytes,
    storagePath,
    sha256,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(admin, queueId, message);
    throw err;
  }
}

async function retryQueueItem(admin: AdminClient, args: RetryArgs): Promise<void> {
  const { data: row, error } = await admin
    .from('rate_con_ingest_queue')
    .select('id, sender_allowed, attachment_storage_path, attachment_filename, attachment_mime_type, attachment_sha256')
    .eq('id', args.queueId)
    .maybeSingle();
  if (error) throw new Error(`Queue item lookup failed: ${error.message}`);
  if (!row) return;
  if (!row.attachment_storage_path) {
    await markFailed(
      admin,
      args.queueId,
      'No stored attachment is linked to this item. Re-forward the email or upload the rate confirmation manually.',
      { updated_by: args.requestedBy },
    );
    return;
  }

  await updateQueue(admin, args.queueId, {
    status: 'pending_parse',
    parse_status: null,
    parse_error: null,
    parsed: null,
    parse_build: null,
    verbatim_checks: null,
    broker_load_number: null,
    text_layer: null,
    text_layer_available: null,
    matched_load_id: null,
    updated_by: args.requestedBy,
  });

  try {
    const { data, error: downloadErr } = await admin.storage
      .from(BUCKET)
      .download(row.attachment_storage_path);
    if (downloadErr || !data) throw new Error(`Stored attachment download failed: ${downloadErr?.message ?? 'missing file'}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const sha256 = row.attachment_sha256 ?? await sha256Hex(bytes);
    await processStoredAttachment(admin, {
      queueId: args.queueId,
      lovableApiKey: args.lovableApiKey,
      senderAllowed: !!row.sender_allowed,
      filename: row.attachment_filename ?? 'rate-con.pdf',
      mimeType: row.attachment_mime_type ?? 'application/pdf',
      bytes,
      storagePath: row.attachment_storage_path,
      sha256,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(admin, args.queueId, message, { updated_by: args.requestedBy });
    throw err;
  }
}

async function processStoredAttachment(admin: AdminClient, args: StoredAttachmentArgs): Promise<void> {
  const { queueId, lovableApiKey, senderAllowed, filename, mimeType, bytes, storagePath, sha256 } = args;

  const finish = async (patch: Record<string, unknown>) => {
    await updateQueue(admin, queueId, patch, { onlyWhileProcessing: true });
  };

  // Extract the text layer with the same pdfjs version the browser uses, then
  // parse in-process through the shared core. No shared secret, no HTTP hop.
  const isPdf = mimeType.toLowerCase().includes('pdf') || filename.toLowerCase().endsWith('.pdf');
  const layer = isPdf ? await extractPdfTextLayerDeno(bytes) : null;
  console.log(
    `ingest ${queueId}: text layer extraction ` +
      (layer?.available
        ? `available chars=${layer.text.length} pages=${layer.pageCount}`
        : `unavailable pages=${layer?.pageCount ?? 0}`),
  );
  if (isPdf && !layer?.available) {
    console.warn(`ingest ${queueId}: no usable text layer — verbatim verification will run as no_layer`);
  }

  const parseOutcome = await parseRateConfirmationCore(
    {
      file_base64: toBase64(bytes),
      mime_type: mimeType,
      file_name: filename,
    },
    lovableApiKey,
  );
  console.log(`ingest ${queueId}: parse core returned status=${parseOutcome.status}`);

  if (parseOutcome.status !== 200) {
    const rejected = parseOutcome.status === 422;
    await finish({
      status: 'needs_manual',
      parse_status: rejected ? 'rejected' : 'failed',
      parse_error: rejected
        ? 'Parser found no load fields — likely not a rate confirmation. Dismiss or enter manually.'
        : `Parse failed: ${JSON.stringify(parseOutcome.body).slice(0, 500)}`,
      attachment_storage_path: storagePath,
      attachment_filename: filename,
      attachment_mime_type: mimeType,
      attachment_bytes: bytes.byteLength,
      attachment_sha256: sha256,
      attachment_page_count: layer?.pageCount ?? null,
      text_layer_available: !!layer?.available,
    });
    return;
  }

  // Verbatim verification + adoption, server-side, before anything is stored.
  const parsedResult = parseOutcome.body as {
    parser_build?: unknown;
    load?: { broker_load_number?: { value?: string | null } | null } | null;
  };
  const judged = judgeParsedVerbatimServer(parsedResult, layer);
  console.log(
    `ingest ${queueId}: verbatim core checks=${judged.checks.length} layer=${judged.layerAvailable ? 'available' : 'missing'}`,
  );
  const adopted = judged.adopted as {
    load?: { broker_load_number?: { value?: string | null } | null } | null;
  };
  const brokerLoadNumber = adopted.load?.broker_load_number?.value ?? null;

  // A queue item whose broker reference matches a load created MANUALLY is
  // handled automatically. The DB trigger covers loads created after this
  // item lands; this covers loads that already exist.
  let status: string = 'parsed';
  let matchedLoadId: string | null = null;
  if (brokerLoadNumber && brokerLoadNumber.trim() !== '') {
    const key = normalizeReference(brokerLoadNumber);
    const { data: loads } = await admin
      .from('loads')
      .select('id, broker_reference_number')
      .not('broker_reference_number', 'is', null)
      .limit(500);
    const hit = (loads ?? []).find(
      (l: { id: string; broker_reference_number: string | null }) =>
        l.broker_reference_number && normalizeReference(l.broker_reference_number) === key,
    );
    if (hit) {
      status = 'auto_handled';
      matchedLoadId = hit.id;
    }
  }

  await finish({
    status: senderAllowed ? status : 'needs_manual',
    parse_status: 'ok',
    parse_error: senderAllowed ? null : 'Recipient was not the dedicated ingest address.',
    matched_load_id: matchedLoadId,
    parsed: judged.adopted,
    parse_build: parsedResult.parser_build ?? null,
    broker_load_number: brokerLoadNumber,
    verbatim_checks: judged.checks,
    text_layer: layer?.available ? layer.text : null,
    text_layer_available: !!layer?.available,
    attachment_storage_path: storagePath,
    attachment_filename: filename,
    attachment_mime_type: mimeType,
    attachment_bytes: bytes.byteLength,
    attachment_sha256: sha256,
    attachment_page_count: layer?.pageCount ?? null,
  });
}
