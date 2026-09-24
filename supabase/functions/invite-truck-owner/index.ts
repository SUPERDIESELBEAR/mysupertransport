import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { buildAppUrl } from '../_shared/app-url.ts';
import { companyIdForUser } from '../_shared/tenancy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .in('role', ['management', 'onboarding_staff', 'owner'])
      .limit(1);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: staff only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolved BEFORE the auth user is created or invited: this path's invitation
    // email is fired by Supabase at user creation, so an unresolvable company has
    // to stop the request here, while nothing has been sent yet.
    const inviteCompanyId = await companyIdForUser(supabaseAdmin, callerUser.id);


    const body = await req.json();
    const {
      operator_id,
      legal_first_name,
      legal_last_name,
      business_name,
      email,
      phone,
      address_street,
      address_city,
      address_state,
      address_zip,
      send_invite = true,
    } = body ?? {};

    if (!operator_id || !legal_first_name || !legal_last_name || !email) {
      return new Response(JSON.stringify({ error: 'operator_id, legal_first_name, legal_last_name, email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Create or find auth user
    let ownerUserId: string | null = null;
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existing = users?.find(u => (u.email ?? '').toLowerCase() === cleanEmail);

    const json = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // The unit being linked must belong to the inviting staff member's carrier.
    const { data: unitRow } = await supabaseAdmin
      .from('operators').select('user_id, company_id').eq('id', operator_id).maybeSingle();
    if (!unitRow || unitRow.company_id !== inviteCompanyId) {
      return json(404, { error: 'This driver was not found at your carrier. Refresh the page and try again.' });
    }

    let linkedExisting = false;
    if (existing) {
      // P61: link an existing driver or truck-owner login at THIS carrier;
      // refuse staff, other carriers, and the unit's own driver.
      const who = await (async () => {
        const { data: p } = await supabaseAdmin
          .from('profiles').select('first_name,last_name').eq('user_id', existing.id).maybeSingle();
        return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'this person';
      })();
      if (unitRow.user_id === existing.id) {
        return json(409, { error: `${who} drives this truck, and a driver cannot be his own truck owner. If he owns this truck, leave the truck owner empty — he signs the ICA himself as its contractor.` });
      }
      const { data: roleRows } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', existing.id);
      const roles = (roleRows ?? []).map((r: any) => r.role as string);
      const staffRoles = ['dispatcher', 'management', 'onboarding_staff', 'owner'];
      const { data: memberRows } = await supabaseAdmin.from('company_members').select('company_id').eq('user_id', existing.id);
      if (roles.some(r => staffRoles.includes(r)) || (memberRows ?? []).length > 0) {
        return json(409, { error: `This email belongs to ${who}, who has a staff login. A staff login cannot be a truck owner. Ask the truck owner for his own email address.` });
      }
      const companies = new Set<string>();
      const { data: ops } = await supabaseAdmin.from('operators').select('company_id').eq('user_id', existing.id);
      (ops ?? []).forEach((r: any) => r.company_id && companies.add(r.company_id));
      const { data: tos } = await supabaseAdmin.from('truck_owners').select('company_id').eq('user_id', existing.id);
      (tos ?? []).forEach((r: any) => r.company_id && companies.add(r.company_id));
      const { data: apps } = await supabaseAdmin.from('applications').select('company_id').eq('user_id', existing.id);
      (apps ?? []).forEach((r: any) => r.company_id && companies.add(r.company_id));
      if ([...companies].some(c => c !== inviteCompanyId)) {
        return json(409, { error: `This email belongs to ${who}, who is signed up with another carrier. A truck owner can lease to one carrier only. Ask the truck owner for a different email address.` });
      }
      const isSameCarrierDriverOrOwner = (ops ?? []).length > 0 || (tos ?? []).length > 0 || roles.includes('truck_owner');
      if (!isSameCarrierDriverOrOwner) {
        return json(409, { error: `This email belongs to ${who}, who is not yet a driver or truck owner here (for example, an applicant still in review). Finish that first, or ask the truck owner for a different email address.` });
      }
      ownerUserId = existing.id;
      linkedExisting = true;
    } else if (send_invite) {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          data: {
            first_name: legal_first_name,
            last_name: legal_last_name,
            invited_as: 'truck_owner',
          },
          redirectTo: `${new URL(buildAppUrl('/')).origin}/welcome`,
        },
      );
      if (inviteError) console.error('invite error:', inviteError.message);
      if (inviteData?.user) ownerUserId = inviteData.user.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: { first_name: legal_first_name, last_name: legal_last_name, invited_as: 'truck_owner' },
      });
      if (createErr) console.error('create user err:', createErr.message);
      if (created?.user) ownerUserId = created.user.id;
    }

    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: 'Could not create or resolve owner user' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign truck_owner role — company named explicitly, error fatal.
    const { error: roleWriteErr } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        { user_id: ownerUserId, role: 'truck_owner', company_id: inviteCompanyId },
        { onConflict: 'user_id,role' },
      );
    if (roleWriteErr) {
      console.error('Truck owner role write failed:', roleWriteErr.message);
      return new Response(JSON.stringify({ error: `Could not grant the truck owner role: ${roleWriteErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Only name a login this call just created — never rename an existing person.
    if (!existing) {
      await supabaseAdmin
        .from('profiles')
        .update({ first_name: legal_first_name, last_name: legal_last_name })
        .eq('user_id', ownerUserId);
    }

    // Upsert truck_owners row (operator_id is UNIQUE so this enforces 1:1)
    const { error: upsertErr } = await supabaseAdmin
      .from('truck_owners')
      .upsert(
        {
          operator_id,
          user_id: ownerUserId,
          // Service-role insert: the stamp trigger refuses unless the row names
          // its company.
          company_id: inviteCompanyId,

          legal_first_name,
          legal_last_name,
          business_name: business_name ?? null,
          email: cleanEmail,
          phone: phone ?? null,
          address_street: address_street ?? null,
          address_city: address_city ?? null,
          address_state: address_state ?? null,
          address_zip: address_zip ?? null,
          invited_at: send_invite && !linkedExisting ? new Date().toISOString() : null,
          created_by: callerUser.id,
        },
        { onConflict: 'operator_id' },
      );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    const actorName = [callerUser.user_metadata?.first_name, callerUser.user_metadata?.last_name].filter(Boolean).join(' ') || 'Staff';
    await supabaseAdmin.from('audit_log').insert({
      actor_id: callerUser.id,
      actor_name: actorName,
      action: linkedExisting ? 'truck_owner_linked' : send_invite ? 'truck_owner_invited' : 'truck_owner_created',
      entity_type: 'operator',
      entity_id: operator_id,
      entity_label: `${legal_first_name} ${legal_last_name}`.trim(),
      metadata: { owner_user_id: ownerUserId, email: cleanEmail, business_name: business_name ?? null },
    });

    // Linked an existing login: no account email. If this unit's ICA is waiting
    // for signature, send the existing "ICA ready to sign" notice, which routes
    // to the truck owner.
    let icaNoticeSent = false;
    if (linkedExisting) {
      const { data: os } = await supabaseAdmin
        .from('onboarding_status').select('ica_status').eq('operator_id', operator_id).maybeSingle();
      if (os?.ica_status === 'sent_for_signature') {
        const { data: dp } = await supabaseAdmin.from('profiles').select('first_name,last_name').eq('user_id', unitRow.user_id).maybeSingle();
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            type: 'onboarding_milestone', operator_id, milestone_key: 'ica_sent',
            milestone: 'ICA Agreement Sent for Signature',
            operator_name: [dp?.first_name, dp?.last_name].filter(Boolean).join(' ') || 'Driver',
          }),
        });
        icaNoticeSent = res.ok;
        await res.text();
      }
    }

    return new Response(JSON.stringify({ ok: true, owner_user_id: ownerUserId, linked_existing: linkedExisting, ica_notice_sent: icaNoticeSent }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('invite-truck-owner error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});