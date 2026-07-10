import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmailStrict, BRAND_NAME } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STAFF_ROLES = new Set(['onboarding_staff', 'dispatcher', 'management', 'owner']);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .limit(10);
    const hasStaffRole = (roleRows ?? []).some((r: { role: string }) => STAFF_ROLES.has(r.role));
    if (!hasStaffRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const {
      operatorId, kind, subject, body,
      sendEmail = true, sendInApp = true, years,
    } = payload as {
      operatorId?: string;
      kind?: 'birthday' | 'anniversary';
      subject?: string;
      body?: string;
      sendEmail?: boolean;
      sendInApp?: boolean;
      years?: number | null;
    };

    if (!operatorId || typeof operatorId !== 'string') {
      return new Response(JSON.stringify({ error: 'operatorId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (kind !== 'birthday' && kind !== 'anniversary') {
      return new Response(JSON.stringify({ error: 'kind must be birthday or anniversary' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!subject?.trim() || !body?.trim()) {
      return new Response(JSON.stringify({ error: 'subject and body are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load operator + applicant context.
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('id, user_id, applications ( email, first_name )')
      .eq('id', operatorId)
      .maybeSingle();
    if (opErr || !op) {
      return new Response(JSON.stringify({ error: 'Operator not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const app = (op as any).applications ?? null;
    const recipientEmail: string | null = app?.email ?? null;
    const firstName: string = (app?.first_name ?? 'Driver').toString();

    // Send email.
    if (sendEmail && recipientEmail) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const heading = kind === 'birthday'
        ? `Happy Birthday, ${escapeHtml(firstName)}! 🎂`
        : `Happy Anniversary, ${escapeHtml(firstName)}! 🎉`;
      const bodyHtml = escapeHtml(body).replace(/\n/g, '<br/>');
      const html = buildEmail(subject, heading, `<p>${bodyHtml}</p>`);
      await sendEmailStrict(recipientEmail, subject, html, resendKey);
    }

    // In-app notification.
    if (sendInApp && (op as any).user_id) {
      await supabase.from('notifications').insert({
        user_id: (op as any).user_id,
        type: 'birthday_anniversary',
        title: subject,
        body,
      });
    }

    return new Response(
      JSON.stringify({ success: true, emailed: !!(sendEmail && recipientEmail), notified: !!(sendInApp && (op as any).user_id) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('send-staff-birthday-message error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});