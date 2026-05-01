import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type StaffRole = 'onboarding_staff' | 'dispatcher' | 'management';

const ROLE_LABELS: Record<StaffRole, string> = {
  onboarding_staff: 'Onboarding Staff',
  dispatcher: 'Dispatcher',
  management: 'Management',
};

function buildInviteEmail(inviteeName: string, role: StaffRole, inviterName: string, inviteUrl: string): string {
  const roleLabel = ROLE_LABELS[role];
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're Invited to SUPERTRANSPORT</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">You've Been Invited to Join the Team</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">
              <p>Hi ${inviteeName},</p>
              <p><strong>${inviterName}</strong> has invited you to join the <strong>SUPERTRANSPORT</strong> operations platform as <strong>${roleLabel}</strong>.</p>
              <p>Click the button below to set up your account and get access to your dashboard.</p>
              <p style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
                <strong>Your Role:</strong> ${roleLabel}
              </p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${inviteUrl}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                Accept Invitation &amp; Set Up Account
              </a>
            </div>
            <p style="color:#999;font-size:13px;">This invitation link expires in 24 hours. If you weren't expecting this, you can ignore this email.</p>
          </td>
        </tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is management
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
      .eq('role', 'management')
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden: only management can invite staff' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, role, first_name, last_name, phone, password } = await req.json() as {
      email: string;
      role: StaffRole;
      first_name?: string;
      last_name?: string;
      phone?: string;
      password?: string;
    };

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'email and role are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const manualCreate = !!password;

    const validRoles: StaffRole[] = ['onboarding_staff', 'dispatcher', 'management'];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate phone length if provided
    if (phone && phone.trim().length > 30) {
      return new Response(JSON.stringify({ error: 'Phone number is too long' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const inviteeName = [first_name, last_name].filter(Boolean).join(' ') || email;

    // Get caller's name for the email / audit log
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    const inviterName = callerProfile
      ? [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ') || 'SUPERTRANSPORT Management'
      : 'SUPERTRANSPORT Management';

    let invitedUserId: string | null = null;

    if (manualCreate) {
      // ── Manual creation path: create user with password, confirm email immediately ──
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: first_name ?? '',
          last_name: last_name ?? '',
          invited_as: role,
        },
      });

      if (createError) {
        console.error('Create user error:', createError.message);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      invitedUserId = createData.user?.id ?? null;
    } else {
      // ── Invite path: send magic-link email ──
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: first_name ?? '',
          last_name: last_name ?? '',
          invited_as: role,
        },
        redirectTo: `${appUrl}/dashboard`,
      });

      if (inviteError && !inviteError.message.includes('already been registered')) {
        console.error('Invite error:', inviteError.message);
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (inviteData?.user) {
        invitedUserId = inviteData.user.id;
      } else {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = users?.find(u => u.email === email);
        if (existing) invitedUserId = existing.id;
      }

      // Send branded invite email via Resend
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (RESEND_API_KEY) {
        const html = buildInviteEmail(inviteeName, role, inviterName, `${appUrl}/login`);
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'SUPERTRANSPORT <onboarding@mysupertransport.com>',
            to: [email],
            subject: `You're invited to join SUPERTRANSPORT as ${ROLE_LABELS[role]}`,
            html,
          }),
        }).catch(e => console.error('Resend error:', e));
      }
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert profile
    await supabaseAdmin.from('profiles').upsert({
      user_id: invitedUserId,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone?.trim() || null,
      invited_by: callerUser.id,
      account_status: manualCreate ? 'active' : 'pending',
    }, { onConflict: 'user_id' });

    // Assign role
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: invitedUserId, role },
      { onConflict: 'user_id,role' }
    );

    // Write audit log entry
    await supabaseAdmin.from('audit_log').insert({
      actor_id: callerUser.id,
      actor_name: inviterName,
      action: manualCreate ? 'staff_created' : 'staff_invited',
      entity_type: 'staff',
      entity_id: invitedUserId,
      entity_label: inviteeName,
      metadata: {
        email,
        role,
        role_label: ROLE_LABELS[role],
        phone: phone?.trim() || null,
        manual_create: manualCreate,
      },
    });

    return new Response(JSON.stringify({ success: true, user_id: invitedUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('invite-staff error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
