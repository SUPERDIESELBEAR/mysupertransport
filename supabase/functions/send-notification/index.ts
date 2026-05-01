import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ONBOARDING_EMAIL = 'onboarding@mysupertransport.com';

// ─── Milestone copy for operator-facing emails ───────────────────────────────
const MILESTONE_OPERATOR_COPY: Record<string, { heading: string; body: (name: string) => string }> = {
  ica_sent: {
    heading: '📝 Action Required: Sign Your ICA Agreement',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>Independent Contractor Agreement (ICA)</strong> has been prepared and sent for your signature.</p>
      <p>Please check your email for a link from <strong>PandaDoc</strong> and sign it at your earliest convenience to keep your onboarding on track.</p>
      <p>Once signed, our team will proceed with the next steps.</p>`,
  },
  ica_complete: {
    heading: '✅ Your ICA Agreement is Complete',
    body: (name) => `<p>Hi ${name},</p>
      <p>Great news — your <strong>Independent Contractor Agreement (ICA)</strong> has been signed and is now on file. This is a major step in your onboarding with SUPERTRANSPORT.</p>
      <p>Our team will be in touch shortly with the next steps. You can log in to your portal at any time to check your onboarding progress.</p>`,
  },
  mvr_approved: {
    heading: '✅ Background Check Approved',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>MVR and Clearinghouse background check</strong> has been reviewed and <strong>approved</strong>.</p>
      <p>You're cleared to continue the onboarding process. Log in to your portal to see your current status.</p>`,
  },
  pe_clear: {
    heading: '✅ Pre-Employment Screening — Clear',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>pre-employment drug & alcohol screening</strong> result has come back <strong>clear</strong>.</p>
      <p>This clears the way for your ICA to be issued. Our onboarding team will reach out with next steps shortly.</p>`,
  },
  docs_requested: {
    heading: '📋 Action Required: Submit Your Documents',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your onboarding coordinator has requested that you upload your required documents.</p>
      <p>Please log in to your portal and navigate to the <strong>Documents</strong> tab to upload the following:</p>
      <ul style="padding-left:20px;line-height:2;">
        <li>Form 2290 (Heavy Vehicle Use Tax)</li>
        <li>Truck Title</li>
        <li>Truck Photos (exterior, all sides)</li>
        <li>Truck Inspection Report</li>
      </ul>
      <p>Submit all documents as soon as possible to keep your onboarding moving forward.</p>`,
  },
  docs_approved: {
    heading: '✅ Your Documents Have Been Approved',
    body: (name) => `<p>Hi ${name},</p>
      <p>All of your required documents have been <strong>received and approved</strong> by our team.</p>
      <p>This is a great milestone — we're one step closer to getting you on the road! Log in to your portal to see your updated onboarding progress.</p>`,
  },
  equipment_ready: {
    heading: '🚛 Equipment Setup Complete',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your equipment setup has been completed:</p>
      <ul style="padding-left:20px;line-height:2;">
        <li>✅ Decal applied</li>
        <li>✅ ELD device installed</li>
        <li>✅ Fuel card issued</li>
      </ul>
      <p>You're almost there! Our team is finalizing your insurance and activation. We'll be in touch very soon.</p>`,
  },
  mo_reg_received: {
    heading: '✅ Missouri Registration Received',
    body: (name) => `<p>Hi ${name},</p>
      <p>Great news — your <strong>Missouri Registration</strong> has been received and is on file.</p>
      <p>Log in to your portal to check your latest onboarding status.</p>`,
  },
  fully_onboarded: {
    heading: '🎉 Welcome to SUPERTRANSPORT — You\'re Fully Onboarded!',
    body: (name) => `<p>Hi ${name},</p>
      <p>Congratulations — you have officially completed the onboarding process and are now a <strong>fully active owner-operator</strong> with SUPERTRANSPORT!</p>
      <p>Here's what happens next:</p>
      <ul style="padding-left:20px;line-height:2;">
        <li>Your dispatcher will be in touch to get you set up with your first load.</li>
        <li>Log in to your portal to view dispatch updates and messages.</li>
        <li>If you have any questions, our team is always here to help.</li>
      </ul>
      <p style="margin-top:16px;">We're thrilled to have you on the road with us. Welcome to the SUPERTRANSPORT family!</p>`,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload: NotificationPayload = await req.json();
    const { type } = payload;

    // ── Helper: get all management/staff emails filtered by email pref ──
    const getManagementEmails = async (eventType: string): Promise<string[]> => {
      const { data: mgmtRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .in('role', ['management', 'onboarding_staff']);

      if (!mgmtRoles?.length) return [];

      // Filter out users who have explicitly disabled email for this event type
      const userIds = mgmtRoles.map(r => r.user_id);
      const { data: optedOut } = await supabaseAdmin
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', userIds)
        .eq('event_type', eventType)
        .eq('email_enabled', false);
      const optedOutIds = new Set((optedOut ?? []).map(r => r.user_id));
      const filteredIds = userIds.filter(id => !optedOutIds.has(id));

      if (!filteredIds.length) return [];
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      return users?.filter(u => filteredIds.includes(u.id) && u.email).map(u => u.email!) ?? [];
    };

    // ── Helper: check if a specific user has email enabled for an event ──
    const userEmailEnabled = async (userId: string, eventType: string): Promise<boolean> => {
      const { data } = await supabaseAdmin
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', userId)
        .eq('event_type', eventType)
        .maybeSingle();
      return data?.email_enabled ?? true; // default enabled
    };

    // ── Helper: check if a specific user has in-app enabled for an event ──
    const userInAppEnabled = async (userId: string, eventType: string): Promise<boolean> => {
      const { data } = await supabaseAdmin
        .from('notification_preferences')
        .select('in_app_enabled')
        .eq('user_id', userId)
        .eq('event_type', eventType)
        .maybeSingle();
      return data?.in_app_enabled ?? true; // default enabled
    };

    // ── Helper: get assigned staff email for an operator ─────────────────
    const getAssignedStaffEmail = async (operatorId: string): Promise<string | null> => {
      const { data: op } = await supabaseAdmin
        .from('operators')
        .select('assigned_onboarding_staff')
        .eq('id', operatorId)
        .single();

      if (!op?.assigned_onboarding_staff) return null;
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(op.assigned_onboarding_staff);
      return user?.email ?? null;
    };

    // ── Helper: get operator's auth email by operator_id ─────────────────
    const getOperatorEmail = async (operatorId: string): Promise<string | null> => {
      const { data: op } = await supabaseAdmin
        .from('operators')
        .select('user_id')
        .eq('id', operatorId)
        .single();
      if (!op?.user_id) return null;
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(op.user_id);
      return user?.email ?? null;
    };

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';

    // ── Route by notification type ───────────────────────────────────────
    switch (type) {

      case 'new_application': {
        const name = payload.applicant_name || 'A new applicant';
        const email = payload.applicant_email || '';
        const mgmtEmails = await getManagementEmails('new_application');

        if (mgmtEmails.length === 0) break;

        const subject = `New Application: ${name}`;
        const html = buildEmail(
          subject,
          '📋 New Driver Application Received',
          `<p>A new driver application has been submitted and is ready for review.</p>
           <p><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}</p>
           <p>Please log in to the Management Portal to review and take action.</p>`,
          { label: 'Review Application', url: `${appUrl}/management` }
        );

        await Promise.all(mgmtEmails.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        break;
      }

      case 'application_approved': {
        const name = payload.applicant_name || 'Applicant';
        const email = payload.applicant_email;
        if (!email) break;

        // Applicant emails are always sent (they are not management users with preferences)
        const subject = 'Your SUPERTRANSPORT Application Has Been Approved!';
        const html = buildEmail(
          subject,
          '👍 Congratulations — You\'ve Been Approved!',
          `<p>Dear ${name},</p>
           <p>We are thrilled to let you know that your driver application with <strong>SUPERTRANSPORT</strong> has been <strong>approved</strong>.</p>
           <p>You should receive a separate email shortly with a link to set up your SUPERTRANSPORT account. Once you log in, you'll be able to track your onboarding progress.</p>
           <p>Welcome to the SUPERTRANSPORT family — we're excited to have you on board!</p>
           ${payload.reviewer_notes ? `<p style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;"><strong>Note from our team:</strong> ${payload.reviewer_notes}</p>` : ''}`,
          { label: 'Set Up Your Account', url: `${appUrl}/login` }
        );

        await sendEmail(email, subject, html, RESEND_API_KEY);
        break;
      }

      case 'application_denied': {
        const name = payload.applicant_name || 'Applicant';
        const email = payload.applicant_email;
        if (!email) break;

        // Applicant emails are always sent (they are not management users with preferences)
        const subject = 'Update on Your SUPERTRANSPORT Application';
        const html = buildEmail(
          subject,
          'Application Status Update',
          `<p>Dear ${name},</p>
           <p>Thank you for taking the time to apply with <strong>SUPERTRANSPORT</strong>. After careful review, we are unable to move forward with your application at this time.</p>
           ${payload.reviewer_notes ? `<p style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;"><strong>Reason:</strong> ${payload.reviewer_notes}</p>` : ''}
           <p>We appreciate your interest in SUPERTRANSPORT and wish you the best in your search.</p>
           <p>If you have questions, please reach out to us directly at <a href="mailto:recruiting@mysupertransport.com" style="color:#C9A84C;">recruiting@mysupertransport.com</a>.</p>`
        );

        await sendEmail(email, subject, html, RESEND_API_KEY);
        break;
      }

      case 'onboarding_milestone': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        const name = payload.operator_name || 'Driver';
        const milestone = payload.milestone || 'a step';
        const milestoneKey = payload.milestone_key;

        // ── 1. Notify staff (respecting email preferences) ───────────────
        const staffEmail = await getAssignedStaffEmail(operatorId);
        const mgmtEmails = await getManagementEmails('onboarding_milestone');
        const staffRecipients = [...new Set([...(staffEmail ? [staffEmail] : []), ...mgmtEmails])];

        if (staffRecipients.length > 0) {
          const staffSubject = `Onboarding Update: ${name}`;
          const staffHtml = buildEmail(
            staffSubject,
            '✅ Onboarding Milestone Reached',
            `<p><strong>${name}</strong> has completed a step in their onboarding process.</p>
             <p><strong>Milestone:</strong> ${milestone}</p>
             <p>Log in to the Staff Portal to view their full onboarding status.</p>`,
            { label: 'View Pipeline', url: `${appUrl}/staff` }
          );
          await Promise.all(staffRecipients.map(e => sendEmail(e, staffSubject, staffHtml, RESEND_API_KEY)));
        }

        // ── 1b. In-app notification for assigned staff ───────────────────
        if (milestoneKey === 'ica_complete') {
          const { data: opRow } = await supabaseAdmin
            .from('operators')
            .select('assigned_onboarding_staff')
            .eq('id', operatorId)
            .single();
          const staffUserId = opRow?.assigned_onboarding_staff;
          if (staffUserId) {
            await supabaseAdmin.from('notifications').insert({
              user_id: staffUserId,
              type: 'onboarding_milestone',
              title: `✍️ ICA Signed — ${name}`,
              body: `${name} has signed their Independent Contractor Agreement. The ICA is now fully executed.`,
              channel: 'in_app',
              link: '/staff',
            });
          }
          // Also notify management users who have in_app enabled for onboarding_milestone
          const { data: mgmtRows } = await supabaseAdmin
            .from('user_roles')
            .select('user_id')
            .eq('role', 'management');
          if (mgmtRows?.length) {
            const mgmtIds = mgmtRows.map(r => r.user_id);
            const { data: optedOut } = await supabaseAdmin
              .from('notification_preferences')
              .select('user_id')
              .in('user_id', mgmtIds)
              .eq('event_type', 'onboarding_milestone')
              .eq('in_app_enabled', false);
            const optedOutIds = new Set((optedOut ?? []).map(r => r.user_id));
            const filtered = mgmtRows.filter(r => !optedOutIds.has(r.user_id));
            if (filtered.length) {
              await supabaseAdmin.from('notifications').insert(
                filtered.map(r => ({
                  user_id: r.user_id,
                  type: 'onboarding_milestone',
                  title: `✍️ ICA Signed — ${name}`,
                  body: `${name} has signed their Independent Contractor Agreement. The ICA is now fully executed.`,
                  channel: 'in_app',
                  link: '/staff',
                }))
              );
            }
          }
        }

        // ── 2. Notify operator ───────────────────────────────────────────
        const operatorEmail = payload.operator_email || await getOperatorEmail(operatorId);
        const copy = milestoneKey ? MILESTONE_OPERATOR_COPY[milestoneKey] : null;

        if (operatorEmail && copy) {
          const operatorSubject = copy.heading.replace(/^[^\w]+/, ''); // strip emoji for subject
          // Deep-link ICA milestones directly to the ICA tab
          const icaMilestones = ['ica_sent', 'ica_complete'];
          const ctaUrl = icaMilestones.includes(milestoneKey ?? '')
            ? `${appUrl}/dashboard?tab=ica`
            : `${appUrl}/dashboard`;
          const ctaLabel = milestoneKey === 'ica_sent'
            ? 'Review & Sign Your ICA'
            : milestoneKey === 'ica_complete'
            ? 'View Executed Agreement'
            : 'View My Onboarding Status';
          const operatorHtml = buildEmail(
            operatorSubject,
            copy.heading,
            copy.body(name) + `<p style="margin-top:24px;">If you have any questions, contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`,
            { label: ctaLabel, url: ctaUrl }
          );
          await sendEmail(operatorEmail, operatorSubject, operatorHtml, RESEND_API_KEY);
        }

        // ── 3. Log in-app notification for operator ──────────────────────
        if (operatorId && copy) {
          const { data: opRow } = await supabaseAdmin
            .from('operators')
            .select('user_id')
            .eq('id', operatorId)
            .single();
          if (opRow?.user_id) {
            const icaMilestones = ['ica_sent', 'ica_complete'];
            const notifLink = icaMilestones.includes(milestoneKey ?? '') ? '/dashboard?tab=ica' : '/dashboard';
            const notifBody = milestoneKey === 'ica_sent'
              ? 'Your Independent Contractor Agreement is ready for your signature. Tap to review and sign now.'
              : milestoneKey === 'ica_complete'
              ? 'Your ICA Agreement is fully executed and on file. Tap to view the signed agreement.'
              : `Your onboarding has reached a new milestone: ${milestone}`;
            await supabaseAdmin.from('notifications').insert({
              user_id: opRow.user_id,
              type: 'onboarding_milestone',
              title: copy.heading.replace(/^[^\w]+/, ''),
              body: notifBody,
              channel: 'in_app',
              link: notifLink,
            });
          }
        }

        break;
      }

      case 'document_uploaded': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        const staffEmail = await getAssignedStaffEmail(operatorId);
        const mgmtEmails = await getManagementEmails('document_uploaded');
        const recipients = [...new Set([...(staffEmail ? [staffEmail] : []), ...mgmtEmails])];
        if (!recipients.length) break;

        const name = payload.operator_name || 'An operator';
        const docType = payload.document_type || 'a document';
        const subject = `Document Uploaded: ${name}`;
        const html = buildEmail(
          subject,
          '📎 New Document Requires Review',
          `<p><strong>${name}</strong> has uploaded a document that may require your review.</p>
           <p><strong>Document type:</strong> ${docType}</p>
           <p>Log in to the Staff Portal to view and approve the document.</p>`,
          { label: 'Review Document', url: `${appUrl}/staff` }
        );

        await Promise.all(recipients.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        break;
      }

      case 'dispatch_status_change': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        const STATUS_LABELS: Record<string, { emoji: string; label: string }> = {
          dispatched:     { emoji: '🚛', label: 'Dispatched' },
          home:           { emoji: '🏠', label: 'Home' },
          truck_down:     { emoji: '🔴', label: 'Truck Down' },
          not_dispatched: { emoji: '⏸️', label: 'Not Dispatched' },
        };
        const newStatus = payload.new_status ?? 'not_dispatched';
        const statusInfo = STATUS_LABELS[newStatus] ?? { emoji: '🔔', label: newStatus };

        // Build in-app notification body for operator
        const laneInfo = payload.current_load_lane ? ` — Lane: ${payload.current_load_lane}` : '';
        const etaInfo = payload.eta_redispatch ? ` — ETA: ${payload.eta_redispatch}` : '';
        const notesInfo = payload.status_notes ? ` — Note: ${payload.status_notes}` : '';
        const notifBody = `Your status has been updated to ${statusInfo.label}${laneInfo}${etaInfo}${notesInfo}`;

        // Look up operator's user_id and name
        const { data: opRow } = await supabaseAdmin
          .from('operators')
          .select('user_id')
          .eq('id', operatorId)
          .single();

        if (opRow?.user_id) {
          const inAppOk = await userInAppEnabled(opRow.user_id, 'dispatch_status_change');
          if (inAppOk) {
            await supabaseAdmin.from('notifications').insert({
              user_id: opRow.user_id,
              type: 'dispatch_status_change',
              title: `${statusInfo.emoji} Dispatch Status: ${statusInfo.label}`,
              body: notifBody,
              channel: 'in_app',
              link: '/dashboard',
            });
          }
        }

        // ── Email the operator themselves on Truck Down ─────────────────
        if (newStatus === 'truck_down') {
          try {
            const operatorEmail = await getOperatorEmail(operatorId);
            // Resolve operator user_id for pref check (re-use opRow already fetched above)
            const opEmailEnabled = opRow?.user_id
              ? await userEmailEnabled(opRow.user_id, 'dispatch_status_change')
              : true;
            if (operatorEmail && opEmailEnabled) {
              const operatorName = payload.operator_name || 'Driver';
              const notesRow = payload.status_notes
                ? `<p style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong>Note from your dispatcher:</strong> ${payload.status_notes}</p>`
                : '';
              const laneRow = payload.current_load_lane
                ? `<p><strong>Load / Lane:</strong> ${payload.current_load_lane}</p>`
                : '';
              const operatorEmailBody = `
                <p>Hi ${operatorName},</p>
                <p>Your dispatch status has been updated to <strong style="color:#b91c1c;">🔴 Truck Down</strong> by your dispatcher.</p>
                ${laneRow}
                ${notesRow}
                <p>Please reach out to your dispatcher as soon as possible to coordinate next steps.</p>
                <p style="margin-top:16px;">You can view your current status and send a message to your dispatcher in your portal.</p>
              `;
              const operatorSubject = `🔴 Action Required — Your Truck is Marked Down`;
              const operatorHtml = buildEmail(
                operatorSubject,
                '🔴 Truck Down — Action Required',
                operatorEmailBody,
                { label: 'View My Portal', url: `${appUrl}/dashboard` }
              );
              await sendEmail(operatorEmail, operatorSubject, operatorHtml, RESEND_API_KEY);
            }
          } catch (opEmailErr) {
            console.warn('Truck Down operator email failed:', opEmailErr);
          }
        }

        // ── Email the dispatcher + management on Truck Down ─────────────
        if (newStatus === 'truck_down') {
          try {
            const operatorName = payload.operator_name || 'Operator';
            const unitNumber = payload.unit_number ? ` (Unit #${payload.unit_number})` : '';
            const notesRow = payload.status_notes
              ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Notes</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#b91c1c;">${payload.status_notes}</td></tr>`
              : '';
            const laneRow = payload.current_load_lane
              ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;">Load / Lane</td><td style="padding:6px 0;font-size:14px;">${payload.current_load_lane}</td></tr>`
              : '';

            const emailBody = `
              <p>A <strong>Truck Down</strong> status has been recorded for one of your operators. Immediate attention may be required.</p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff5f5;border-radius:8px;padding:16px;border:1px solid #fecaca;">
                <tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Operator</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${operatorName}${unitNumber}</td></tr>
                <tr><td style="padding:6px 0;color:#888;font-size:13px;">Status</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#b91c1c;">🔴 Truck Down</td></tr>
                ${laneRow}
                ${notesRow}
              </table>
              <p style="font-size:13px;color:#666;">Logged at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CT</p>
            `;
            const subject = `🔴 Truck Down Alert — ${operatorName}${unitNumber}`;
            const html = buildEmail(subject, '🔴 Truck Down Alert', emailBody, { label: 'Open Dispatch Board', url: `${appUrl}/dispatch` });

            // Collect recipients: dispatcher who set the status + all management users
            const recipientEmails = new Set<string>();

            if (payload.caller_user_id) {
              const { data: { user: dispatcherUser } } = await supabaseAdmin.auth.admin.getUserById(payload.caller_user_id);
              if (dispatcherUser?.email) recipientEmails.add(dispatcherUser.email);
            }

            // Fetch management role users
            // Fetch management role users (filtered by email pref for truck_down)
            const { data: mgmtRoles } = await supabaseAdmin
              .from('user_roles')
              .select('user_id')
              .eq('role', 'management');

            if (mgmtRoles?.length) {
              const mgmtIds = mgmtRoles.map(r => r.user_id);

              // Email: filter by email_enabled preference
              const { data: emailOptedOut } = await supabaseAdmin
                .from('notification_preferences')
                .select('user_id')
                .in('user_id', mgmtIds)
                .eq('event_type', 'truck_down')
                .eq('email_enabled', false);
              const emailOptedOutIds = new Set((emailOptedOut ?? []).map(r => r.user_id));
              const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
              allUsers
                ?.filter(u => mgmtIds.includes(u.id) && !emailOptedOutIds.has(u.id) && u.email)
                .forEach(u => recipientEmails.add(u.email!));

              // In-app: filter by in_app_enabled preference
              const { data: inAppOptedOut } = await supabaseAdmin
                .from('notification_preferences')
                .select('user_id')
                .in('user_id', mgmtIds)
                .eq('event_type', 'truck_down')
                .eq('in_app_enabled', false);
              const inAppOptedOutIds = new Set((inAppOptedOut ?? []).map(r => r.user_id));
              const inAppRecipients = mgmtRoles.filter(r => !inAppOptedOutIds.has(r.user_id));
              if (inAppRecipients.length) {
                await supabaseAdmin.from('notifications').insert(
                  inAppRecipients.map(r => ({
                    user_id: r.user_id,
                    type: 'truck_down',
                    title: `🔴 Truck Down — ${operatorName}${unitNumber}`,
                    body: `Truck Down status set${payload.status_notes ? `: ${payload.status_notes}` : ''}`,
                    channel: 'in_app',
                    link: '/dispatch',
                  }))
                );
              }
            }
          } catch (emailErr) {
            console.warn('Truck Down alert email failed:', emailErr);
          }
        }

        break;
      }

      case 'new_message': {
        const recipientUserId = payload.recipient_user_id;
        if (!recipientUserId) break;

        const senderName = payload.sender_name || 'Your coordinator';
        const preview = payload.message_preview || 'You have a new message.';

        // ── 1. In-app notification (respect in_app pref) ─────────────────
        const msgInAppOk = await userInAppEnabled(recipientUserId, 'new_message');
        if (msgInAppOk) {
          await supabaseAdmin.from('notifications').insert({
            user_id: recipientUserId,
            type: 'new_message',
            title: `💬 New message from ${senderName}`,
            body: preview.length > 120 ? preview.slice(0, 117) + '…' : preview,
            channel: 'in_app',
            link: '/dashboard?tab=messages',
          });
        }

        // ── 2. Email the operator (respect email pref) ────────────────────
        const msgEmailOk = await userEmailEnabled(recipientUserId, 'new_message');
        try {
          const { data: { user: recipientUser } } = await supabaseAdmin.auth.admin.getUserById(recipientUserId);
          const recipientEmail = recipientUser?.email;
          if (recipientEmail && msgEmailOk) {
            const subject = `New message from ${senderName} — SUPERTRANSPORT`;
            const html = buildEmail(
              subject,
              `💬 You have a new message`,
              `<p>Hi,</p>
              <p><strong>${senderName}</strong> from your onboarding team has sent you a new message:</p>
              <blockquote style="border-left:4px solid #C9A84C;padding:12px 16px;margin:16px 0;background:#fdf9ee;border-radius:0 6px 6px 0;color:#444;font-style:italic;">
                "${preview.length > 300 ? preview.slice(0, 297) + '…' : preview}"
              </blockquote>
              <p>Log in to your portal to read the full message and reply.</p>`,
              { label: 'View Message', url: `${appUrl}/dashboard?tab=messages` }
            );
            await sendEmail(recipientEmail, subject, html, RESEND_API_KEY);
          }
        } catch (emailErr) {
          console.warn('New message email to operator failed:', emailErr);
        }

        break;
      }

      case 'truck_down': {
        // Called by the DB trigger via pg_net when any operator transitions to truck_down.
        // Sends email to all dispatchers + management users (respecting truck_down email prefs).
        const operatorName = payload.operator_name || 'An operator';
        const unitNumber   = payload.unit_number ? ` (Unit #${payload.unit_number})` : '';
        const notesRow     = payload.status_notes
          ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Notes</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#b91c1c;">${payload.status_notes}</td></tr>`
          : '';
        const laneRow = payload.current_load_lane
          ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;">Load / Lane</td><td style="padding:6px 0;font-size:14px;">${payload.current_load_lane}</td></tr>`
          : '';

        const emailBody = `
          <p>A <strong>Truck Down</strong> status has been recorded for one of your operators. Immediate attention may be required.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff5f5;border-radius:8px;padding:16px;border:1px solid #fecaca;">
            <tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Operator</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${operatorName}${unitNumber}</td></tr>
            <tr><td style="padding:6px 0;color:#888;font-size:13px;">Status</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#b91c1c;">🔴 Truck Down</td></tr>
            ${laneRow}
            ${notesRow}
          </table>
          <p style="font-size:13px;color:#666;">Logged at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CT</p>
        `;
        const subject = `🔴 Truck Down Alert — ${operatorName}${unitNumber}`;
        const html = buildEmail(subject, '🔴 Truck Down Alert', emailBody, {
          label: 'Open Dispatch Board',
          url: `${appUrl}/dispatch`,
        });

        // ── Resolve assigned onboarding staff for this operator ──────────
        let assignedOnboardingStaffId: string | null = null;
        if (payload.operator_id) {
          const { data: opRow } = await supabaseAdmin
            .from('operators')
            .select('assigned_onboarding_staff')
            .eq('id', payload.operator_id)
            .maybeSingle();
          assignedOnboardingStaffId = opRow?.assigned_onboarding_staff ?? null;
        }

        // ── 1. Send staff-specific email with deep-link to operator panel ─
        if (assignedOnboardingStaffId) {
          const staffEmailEnabled = await userEmailEnabled(assignedOnboardingStaffId, 'truck_down');
          if (staffEmailEnabled) {
            const { data: { user: staffUser } } = await supabaseAdmin.auth.admin.getUserById(assignedOnboardingStaffId);
            if (staffUser?.email) {
              const staffDeepLink = payload.operator_id
                ? `${appUrl}/staff?operator=${payload.operator_id}`
                : `${appUrl}/staff`;
              const staffHtml = buildEmail(subject, '🔴 Truck Down Alert', emailBody, {
                label: 'View Operator in Pipeline',
                url: staffDeepLink,
              });
              await sendEmail(staffUser.email, subject, staffHtml, RESEND_API_KEY);
            }
          }
        }

        // ── 2. Send dispatcher + management emails (link to Dispatch Board) ─
        const { data: staffRoles } = await supabaseAdmin
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['dispatcher', 'management']);

        // Exclude the assigned onboarding staff — they already received a tailored email above
        const baseIds = staffRoles?.length ? [...new Set(staffRoles.map(r => r.user_id))] : [];
        const dispatchMgmtIds = assignedOnboardingStaffId
          ? baseIds.filter(id => id !== assignedOnboardingStaffId)
          : baseIds;

        if (dispatchMgmtIds.length) {
          const { data: emailOptedOut } = await supabaseAdmin
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', dispatchMgmtIds)
            .eq('event_type', 'truck_down')
            .eq('email_enabled', false);
          const emailOptedOutIds = new Set((emailOptedOut ?? []).map(r => r.user_id));
          const recipientIds = dispatchMgmtIds.filter(id => !emailOptedOutIds.has(id));

          if (recipientIds.length) {
            const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
            const recipientEmails = allUsers
              ?.filter(u => recipientIds.includes(u.id) && u.email)
              .map(u => u.email!) ?? [];
            await Promise.all(recipientEmails.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
          }
        }

        break;
      }

      case 'pe_receipt_uploaded': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        // Resolve operator name
        const { data: opRow } = await supabaseAdmin
          .from('operators')
          .select('assigned_onboarding_staff, application_id')
          .eq('id', operatorId)
          .single();

        let operatorName = 'An operator';
        if (opRow?.application_id) {
          const { data: appRow } = await supabaseAdmin
            .from('applications')
            .select('first_name, last_name')
            .eq('id', opRow.application_id)
            .single();
          if (appRow) {
            operatorName = [appRow.first_name, appRow.last_name].filter(Boolean).join(' ') || operatorName;
          }
        }

        // In-app: notify assigned staff
        if (opRow?.assigned_onboarding_staff) {
          const inAppOk = await userInAppEnabled(opRow.assigned_onboarding_staff, 'onboarding_milestone');
          if (inAppOk) {
            await supabaseAdmin.from('notifications').insert({
              user_id: opRow.assigned_onboarding_staff,
              type: 'pe_receipt_uploaded',
              title: `📄 PE Receipt Uploaded — ${operatorName}`,
              body: `${operatorName} has uploaded their PE screening receipt. Log in to review.`,
              channel: 'in_app',
              link: `/staff?operator=${operatorId}`,
            });
          }
        }

        // In-app: notify management
        const { data: mgmtRows } = await supabaseAdmin
          .from('user_roles')
          .select('user_id')
          .eq('role', 'management');
        if (mgmtRows?.length) {
          const mgmtIds = mgmtRows.map(r => r.user_id);
          const { data: optedOut } = await supabaseAdmin
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', mgmtIds)
            .eq('event_type', 'onboarding_milestone')
            .eq('in_app_enabled', false);
          const optedOutIds = new Set((optedOut ?? []).map(r => r.user_id));
          const filtered = mgmtRows.filter(r => !optedOutIds.has(r.user_id));
          if (filtered.length) {
            await supabaseAdmin.from('notifications').insert(
              filtered.map(r => ({
                user_id: r.user_id,
                type: 'pe_receipt_uploaded',
                title: `📄 PE Receipt Uploaded — ${operatorName}`,
                body: `${operatorName} has uploaded their PE screening receipt. Log in to review.`,
                channel: 'in_app',
                link: `/staff?operator=${operatorId}`,
              }))
            );
          }
        }

        // Email: notify assigned staff + management
        const staffEmail = await getAssignedStaffEmail(operatorId);
        const mgmtEmails = await getManagementEmails('onboarding_milestone');
        const recipients = [...new Set([...(staffEmail ? [staffEmail] : []), ...mgmtEmails])];
        if (recipients.length) {
          const subject = `PE Receipt Uploaded — ${operatorName}`;
          const html = buildEmail(
            subject,
            '📄 PE Screening Receipt Uploaded',
            `<p><strong>${operatorName}</strong> has uploaded their PE screening receipt and it is ready for review.</p>
             <p>Log in to the Staff Portal to view the receipt and update their screening status.</p>`,
            { label: 'View in Pipeline', url: `${appUrl}/staff?operator=${operatorId}` }
          );
          await Promise.all(recipients.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        }
        break;
      }

      case 'qpassport_uploaded': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        // Resolve operator row (user_id + application_id)
        const { data: opRow } = await supabaseAdmin
          .from('operators')
          .select('user_id, application_id')
          .eq('id', operatorId)
          .single();

        if (!opRow?.user_id) break;
        const opUserId = opRow.user_id;

        let operatorName = 'Driver';
        if (opRow.application_id) {
          const { data: appRow } = await supabaseAdmin
            .from('applications')
            .select('first_name, last_name')
            .eq('id', opRow.application_id)
            .single();
          if (appRow) {
            operatorName = [appRow.first_name, appRow.last_name].filter(Boolean).join(' ') || operatorName;
          }
        }

        // ── In-app notification for operator ─────────────────────────────
        const inAppOk = await userInAppEnabled(opUserId, 'onboarding_update');
        if (inAppOk) {
          await supabaseAdmin.from('notifications').insert({
            user_id: opUserId,
            type: 'onboarding_update',
            title: '📋 Your QPassport is Ready',
            body: 'Your QPassport has been uploaded by your coordinator. Download it and bring it to your drug screening appointment.',
            channel: 'in_app',
            link: '/operator',
          });
        }

        // ── Email notification for operator ───────────────────────────────
        const emailOk = await userEmailEnabled(opUserId, 'onboarding_update');
        if (emailOk) {
          const operatorEmail = await getOperatorEmail(operatorId);
          if (operatorEmail) {
            const subject = 'Action Required: Download Your QPassport';
            const html = buildEmail(
              subject,
              '📋 Your QPassport is Ready',
              `<p>Hi ${operatorName},</p>
               <p>Your <strong>QPassport</strong> has been uploaded by your onboarding coordinator and is now available for download in your portal.</p>
               <p><strong>Important:</strong> You must bring this document to your drug screening appointment. The facility will scan the barcode to verify your identity before the test.</p>
               <p>Please log in to your portal, open the <strong>Stage 1 — Background Check</strong> section, and download your QPassport now.</p>
               <p style="margin-top:16px;">If you have any questions, contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`,
              { label: 'Download My QPassport', url: `${appUrl}/operator` }
            );
            await sendEmail(operatorEmail, subject, html, RESEND_API_KEY);
          }
        }
        break;
      }

      case 'request_ssn': {
        const name = payload.applicant_name || 'Applicant';
        const email = payload.applicant_email;
        const applicationId = payload.application_id;
        if (!email || !applicationId) {
          return new Response(JSON.stringify({ error: 'Missing applicant_email or application_id' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const ssnLink = `${appUrl}/apply/ssn?id=${applicationId}`;
        const subject = 'Action Needed: Please Update Your Application — SUPERTRANSPORT';
        const html = buildEmail(
          subject,
          '📋 Action Needed — Update Your Application',
          `<p>Dear ${name},</p>
           <p>Thank you for submitting your driver application with <strong>SUPERTRANSPORT</strong>.</p>
           <p>We experienced a minor technical issue during the submission process, and unfortunately your <strong>Social Security Number</strong> was not captured. We sincerely apologize for the inconvenience.</p>
           <p>To complete your application, please click the button below. You will be taken to a secure page where you can enter your SSN — no need to re-fill your entire application.</p>
           <p>Your information is encrypted and stored securely. This should only take a moment.</p>
           <p style="margin-top:16px;">If you have any questions or need assistance, please reach out to us at <a href="mailto:${ONBOARDING_EMAIL}" style="color:#C9A84C;">${ONBOARDING_EMAIL}</a>.</p>
           <p>Thank you for your patience and understanding!</p>`,
          { label: 'Update My Application', url: ssnLink },
          ONBOARDING_EMAIL
        );

        await sendEmail(email, subject, html, RESEND_API_KEY);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown notification type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-notification error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
