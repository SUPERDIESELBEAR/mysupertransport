import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
        <tr>
          <td style="background:#0f1117;padding:24px 40px;border-bottom:3px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">DRIVER OPERATIONS</p>
          </td>
        </tr>
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
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:recruiting@supertransportllc.com" style="color:#C9A84C;">recruiting@supertransportllc.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
          </td>
        </tr>
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

    const { email, role, first_name, last_name, phone } = await req.json() as {
      email: string;
      role: StaffRole;
      first_name?: string;
      last_name?: string;
      phone?: string;
    };

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'email and role are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const appUrl = 'https://id-preview--ab645bc4-83af-495c-aca5-d40c7ca0fb70.lovable.app';
    const inviteeName = [first_name, last_name].filter(Boolean).join(' ') || email;

    // Get caller's name for the email
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    const inviterName = callerProfile
      ? [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ') || 'SUPERTRANSPORT Management'
      : 'SUPERTRANSPORT Management';

    // Send auth invite
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

    // Resolve user id
    let invitedUserId: string | null = null;
    if (inviteData?.user) {
      invitedUserId = inviteData.user.id;
    } else {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === email);
      if (existing) invitedUserId = existing.id;
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert profile (include phone if provided)
    await supabaseAdmin.from('profiles').upsert({
      user_id: invitedUserId,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone?.trim() || null,
      invited_by: callerUser.id,
      account_status: 'pending',
    }, { onConflict: 'user_id' });

    // Assign role
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: invitedUserId, role },
      { onConflict: 'user_id,role' }
    );

    // Send branded email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      const subject = `You're invited to join SUPERTRANSPORT as ${ROLE_LABELS[role]}`;
      // Build a usable invite URL pointing to login
      const html = buildInviteEmail(inviteeName, role, inviterName, `${appUrl}/login`);

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'SUPERTRANSPORT <onboarding@resend.dev>',
          to: [email],
          subject,
          html,
        }),
      }).catch(e => console.error('Resend error:', e));
    }

    // Write audit log entry
    await supabaseAdmin.from('audit_log').insert({
      actor_id: callerUser.id,
      actor_name: inviterName,
      action: 'staff_invited',
      entity_type: 'staff',
      entity_id: invitedUserId,
      entity_label: inviteeName,
      metadata: {
        email,
        role,
        role_label: ROLE_LABELS[role],
        phone: phone?.trim() || null,
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
