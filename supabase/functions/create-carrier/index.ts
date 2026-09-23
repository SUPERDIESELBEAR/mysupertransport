/**
 * create-carrier — demo carrier stage 4 part 2b (P43–P47).
 *
 * The ONLY way a carrier is made. The platform screen is never the gate; this
 * function is, and the database re-checks again inside create_carrier().
 *
 *   1. caller's token → getClaims → sub; is_platform_admin(sub) else 403
 *   2. validate the body shape (zod)
 *   3. DRY RUN of create_carrier() — every database row written and then rolled
 *      back by the function's own raise. This is where every input rule lives
 *      (required fields, slug format, USDOT / slug / ingest address unique, P47
 *      owner email unused), so a refusal never costs an auth account.
 *      dry_run=true stops here and returns the would-be rows.
 *   4. create the owner's auth account (no email yet)
 *   5. create_carrier() for real, in one transaction, naming that owner
 *   6. database failure → delete the auth account created in step 4
 *   7. success → invitation link generated and emailed; an email failure keeps
 *      the carrier (the owner can be re-sent a link) and says so.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { buildAppUrl } from '../_shared/app-url.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const str = z.string().trim().max(300).optional();
const pct = z.union([z.number(), z.string().trim().max(10)]).optional();

const InputsSchema = z.object({
  legal_name: str, usdot_number: str, mc_number: str,
  main_office_address: str, home_terminal_address: str, home_terminal_timezone: str,
  fmcsa_division_state: str, applicant_locality: str, apply_slug: str,
  rate_con_ingest_address: str, load_number_prefix: str, invoice_number_prefix: str,
  owner_first_name: str, owner_last_name: str, owner_email: str,
  signature_typed_name: str, signature_title: str,
  dispatch_pct: pct, factoring_pct: pct, dispatch_rates_effective_from: str,
  inspection_submission_email: str,
  pay: z.record(z.string(), pct).optional(),
}).strict();

const BodySchema = z.object({ inputs: InputsSchema, dry_run: z.boolean().default(true) });

const DRY_SENTINEL = 'CREATE_CARRIER_DRY_RUN';

function refusal(err: { message?: string; hint?: string | null; code?: string }) {
  const status = err.code === '42501' ? 403 : err.code === '23505' ? 409 : 400;
  return json({ error: err.message ?? 'Refused', field: err.hint || null, code: err.code ?? null }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Who is calling, and do they hold the platform power?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
  const actor = claimsData?.claims?.sub as string | undefined;
  if (claimsErr || !actor) return json({ error: 'Unauthorized' }, 401);

  const { data: isPlatform, error: paErr } = await admin.rpc('is_platform_admin', { _user_id: actor });
  if (paErr) return json({ error: 'Could not check platform access' }, 500);
  if (isPlatform !== true) return json({ error: 'Only a SUPERDRIVE platform operator can create a carrier.' }, 403);

  // 2. Shape.
  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
    body = parsed.data;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const inputs = { ...body.inputs } as Record<string, unknown>;
  const ownerEmail = String(inputs.owner_email ?? '').trim().toLowerCase();

  // 3. Full database step, rolled back by its own raise.
  const dry = await admin.rpc('create_carrier', {
    p_inputs: { ...inputs, dry_run: true }, p_owner: null, p_actor: actor,
  });
  if (!dry.error) return json({ error: 'Dry run did not roll back; nothing further attempted.' }, 500);
  if (dry.error.message !== DRY_SENTINEL) return refusal(dry.error);
  let plan: unknown = null;
  try { plan = JSON.parse(dry.error.details ?? 'null'); } catch { plan = null; }
  if (body.dry_run) return json({ dry_run: true, saved: false, plan });

  // 4. Owner's login first — bootstrap_assign_owner needs it to exist.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: false,
    user_metadata: {
      first_name: String(inputs.owner_first_name ?? ''),
      last_name: String(inputs.owner_last_name ?? ''),
      invited_as: 'owner',
    },
  });
  if (createErr || !created?.user) {
    const already = (createErr?.message ?? '').toLowerCase().includes('already');
    return json({
      error: already
        ? 'The owner email already belongs to a SUPERDRIVE user; a person linked to two carriers resolves to neither.'
        : `Could not create the owner's login: ${createErr?.message ?? 'unknown error'}`,
      field: 'owner_email',
    }, already ? 409 : 500);
  }
  const ownerId = created.user.id;

  // 5. The one transaction.
  const real = await admin.rpc('create_carrier', { p_inputs: inputs, p_owner: ownerId, p_actor: actor });
  if (real.error) {
    // 6. Nothing was saved; remove the login we just made.
    const { error: delErr } = await admin.auth.admin.deleteUser(ownerId);
    if (delErr) console.error('create-carrier: orphan owner login could not be deleted', ownerId, delErr.message);
    const r = refusal(real.error);
    return delErr
      ? json({ error: real.error.message, field: real.error.hint || null, orphan_login: ownerId }, r.status)
      : r;
  }
  const result = real.data as { company_id: string; rows: unknown };

  // 7. Invite the owner. A failure here keeps the carrier.
  let inviteSent = false;
  try {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite', email: ownerEmail, options: { redirectTo: buildAppUrl('/welcome') },
    });
    const RESEND = Deno.env.get('RESEND_API_KEY');
    if (!linkErr && link?.properties?.action_link && RESEND) {
      const name = String(inputs.owner_first_name ?? '').trim() || 'there';
      const carrier = String(inputs.legal_name ?? '').trim();
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SUPERDRIVE <onboarding@mysupertransport.com>',
          to: [ownerEmail],
          subject: `Your SUPERDRIVE account for ${carrier}`,
          html: `<p>Hi ${name},</p><p>${carrier} has been set up on SUPERDRIVE and you are its owner.</p>
<p><a href="${link.properties.action_link}">Set up your account</a></p>
<p>This link expires in 24 hours.</p>`,
        }),
      });
      inviteSent = resp.ok;
    }
  } catch (e) {
    console.error('create-carrier: invite failed', e);
  }

  return json({ dry_run: false, saved: true, company_id: result.company_id, rows: result.rows, invite_sent: inviteSent });
});
