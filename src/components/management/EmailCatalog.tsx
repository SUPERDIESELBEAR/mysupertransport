import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Eye, Mail, Send, Loader2, CheckCircle2, Globe, ExternalLink, FileEdit, UserPlus, Pencil, Save, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// ─── Mirrored client-side build helpers (no Deno) ────────────────────────────
const BRAND_COLOR  = '#C9A84C';
const BRAND_DARK   = '#0f1117';
const BRAND_NAME   = 'SUPERTRANSPORT';
const SUPPORT_EMAIL    = 'support@mysupertransport.com';
const ONBOARDING_EMAIL = 'onboarding@mysupertransport.com';
const RECRUITING_EMAIL = 'recruiting@mysupertransport.com';

function emailHeader(subtitle = 'DRIVER OPERATIONS'): string {
  return `<tr>
    <td style="background:${BRAND_DARK};padding:24px 40px;border-bottom:3px solid ${BRAND_COLOR};">
      <p style="margin:0;color:${BRAND_COLOR};font-size:22px;font-weight:800;letter-spacing:2px;">${BRAND_NAME}</p>
      <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">${subtitle}</p>
    </td>
  </tr>`;
}

function emailFooter(footerEmail = SUPPORT_EMAIL, footerNote = 'This is an automated notification. Please do not reply to this email.'): string {
  return `<tr>
    <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
      <p style="margin:0;color:#999;font-size:12px;">${BRAND_NAME} &nbsp;·&nbsp; Questions? <a href="mailto:${footerEmail}" style="color:${BRAND_COLOR};">${footerEmail}</a></p>
      <p style="margin:6px 0 0;color:#bbb;font-size:11px;">${footerNote}</p>
    </td>
  </tr>`;
}

function buildEmail(
  subject: string,
  heading: string,
  body: string,
  cta?: { label: string; url: string },
  footerEmail = SUPPORT_EMAIL
): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${cta.url}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">${cta.label}</a>
       </div>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_DARK};font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            ${ctaHtml}
          </td>
        </tr>
        ${emailFooter(footerEmail)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Template catalog ─────────────────────────────────────────────────────────
type Recipient = 'operator' | 'staff' | 'applicant' | 'management';
type Category  = 'onboarding' | 'invitations' | 'compliance' | 'documents' | 'notifications';

interface EmailTemplate {
  id: string;
  category: Category;
  title: string;
  subject: string;
  recipient: Recipient;
  sender: string;
  renderHtml: () => string;
}

const SAMPLE_NAME    = 'John Smith';
const SAMPLE_DATE    = 'January 15, 2026';
const SAMPLE_APP_URL = 'https://mysupertransport.com';

const TEMPLATES: EmailTemplate[] = [
  // ── Onboarding Milestones ──────────────────────────────────────────────────
  {
    id: 'bg_cleared',
    category: 'onboarding',
    title: 'Background Check Cleared',
    subject: 'Background Check Approved — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Background Check Approved — SUPERTRANSPORT',
      '✅ Background Check Cleared',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Great news — your <strong>MVR and Clearinghouse background checks</strong> have been reviewed and <strong>approved</strong> by our team.</p>
       <p>You're cleared to continue the onboarding process. Your coordinator will be reaching out shortly with next steps.</p>
       <p>Log in to your portal anytime to check your current onboarding progress.</p>`,
      { label: 'View My Onboarding Status', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'bg_flagged',
    category: 'onboarding',
    title: 'Background Check — Action Required',
    subject: 'Background Check — Action Required | SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Background Check — Action Required | SUPERTRANSPORT',
      '⚠️ Background Check — Action Required',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Our team has reviewed your MVR and Clearinghouse results and found an item that requires follow-up.</p>
       <p>Your onboarding coordinator will reach out to you directly with details and next steps.</p>
       <p>If you have questions in the meantime, please contact us at <a href="mailto:${ONBOARDING_EMAIL}" style="color:${BRAND_COLOR};">${ONBOARDING_EMAIL}</a>.</p>`,
      { label: 'Log In to Your Portal', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'ica_ready',
    category: 'onboarding',
    title: 'ICA Ready to Sign',
    subject: 'Action Required: Your ICA Agreement is Ready to Sign',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Action Required: Your ICA Agreement is Ready to Sign',
      '📝 Your ICA Agreement is Ready',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your <strong>Independent Contractor Agreement (ICA)</strong> has been prepared by your onboarding coordinator and is now ready for your signature.</p>
       <p>Please log in to your operator portal and navigate to the <strong>ICA</strong> tab to review and sign your agreement at your earliest convenience.</p>
       <p>Completing your ICA is required before moving forward with Missouri registration and equipment setup.</p>`,
      { label: 'Review & Sign My ICA', url: `${SAMPLE_APP_URL}/dashboard?tab=ica` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'ica_complete',
    category: 'onboarding',
    title: 'ICA Agreement Complete',
    subject: 'ICA Agreement Signed & Complete — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'ICA Agreement Signed & Complete — SUPERTRANSPORT',
      '✅ ICA Agreement Complete',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your <strong>Independent Contractor Agreement (ICA)</strong> is now fully signed and on file with SUPERTRANSPORT.</p>
       <p>This is a major milestone in your onboarding journey. Our team will now proceed with Missouri registration and equipment setup.</p>`,
      { label: 'View My Onboarding Progress', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'drug_screening',
    category: 'onboarding',
    title: 'Drug Screening Scheduled',
    subject: 'Drug Screening Scheduled — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Drug Screening Scheduled — SUPERTRANSPORT',
      '🔬 Drug Screening Scheduled',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your <strong>pre-employment drug screening</strong> has been scheduled.</p>
       <p>You should receive a separate email with the clinic location and instructions. Please complete your screening as soon as possible to keep your onboarding on track.</p>
       <p>If you have any questions, contact your coordinator at <a href="mailto:${ONBOARDING_EMAIL}" style="color:${BRAND_COLOR};">${ONBOARDING_EMAIL}</a>.</p>`,
      { label: 'View My Portal', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'mo_reg_filed',
    category: 'onboarding',
    title: 'MO Registration Filed',
    subject: 'Missouri Registration Filed — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Missouri Registration Filed — SUPERTRANSPORT',
      '📋 Missouri Registration Submitted',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your <strong>Missouri apportioned registration</strong> documents have been submitted to the state on your behalf.</p>
       <p>State approval typically takes <strong>2–4 weeks</strong>. We'll notify you as soon as it's received.</p>
       <p>In the meantime, you can check your onboarding status in your portal.</p>`,
      { label: 'View My Onboarding Progress', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'mo_reg_received',
    category: 'onboarding',
    title: 'MO Registration Received',
    subject: 'Missouri Registration Approved — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Missouri Registration Approved — SUPERTRANSPORT',
      '✅ Missouri Registration Received',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your <strong>Missouri apportioned registration</strong> has been approved and is now on file.</p>
       <p>Our team will now move forward with your equipment setup — ELD installation, decal, and fuel card.</p>`,
      { label: 'View My Onboarding Progress', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'fully_onboarded',
    category: 'onboarding',
    title: 'Fully Onboarded',
    subject: "🎉 You're Fully Onboarded — Welcome to SUPERTRANSPORT!",
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      "🎉 You're Fully Onboarded — Welcome to SUPERTRANSPORT!",
      "🎉 Welcome to SUPERTRANSPORT — You're Ready to Roll!",
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Congratulations! You have officially completed the entire onboarding process and are now a <strong>fully active owner-operator</strong> with SUPERTRANSPORT.</p>
       <p>Here's what comes next:</p>
       <ul style="padding-left:20px;line-height:2.2;">
         <li>Your dispatcher will be reaching out to get you set up with your first load.</li>
         <li>Log in to your portal to view dispatch updates, messages, and documents.</li>
         <li>Questions? Our team is always here at <a href="mailto:dispatch@mysupertransport.com" style="color:${BRAND_COLOR};">dispatch@mysupertransport.com</a>.</li>
       </ul>
       <p style="margin-top:16px;">We're thrilled to have you on the road with us. Welcome to the family!</p>`,
      { label: 'Go to My Portal', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'document_received',
    category: 'onboarding',
    title: 'Document Received & Confirmed',
    subject: 'Document Received — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Document Received — SUPERTRANSPORT',
      '✅ Document Received & Confirmed',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Your onboarding coordinator has confirmed receipt of one of your required documents.</p>
       <p>Log in to your portal to see your updated document status and any remaining items.</p>`,
      { label: 'View My Documents', url: `${SAMPLE_APP_URL}/dashboard?tab=documents` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'go_live_set',
    category: 'onboarding',
    title: 'Go-Live Date Confirmed',
    subject: '🚛 Your Go-Live Date is Confirmed — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '🚛 Your Go-Live Date is Confirmed — SUPERTRANSPORT',
      "🚛 You're Cleared to Start Dispatching!",
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Congratulations — your onboarding is complete and your <strong>go-live date has been officially confirmed for ${SAMPLE_DATE}</strong>.</p>
       <p>Here's what to expect next:</p>
       <ul style="padding-left:20px;line-height:2.2;">
         <li>Expect a call from our dispatch team at <a href="mailto:dispatch@mysupertransport.com" style="color:${BRAND_COLOR};">dispatch@mysupertransport.com</a> to get you set up with your first load assignment.</li>
         <li>Log in to your portal to monitor your <strong>dispatch status</strong> and messages.</li>
         <li>Keep your ELD active and your fuel card on hand — you're ready to roll.</li>
         <li>Questions before your start date? Reach your coordinator at <a href="mailto:${ONBOARDING_EMAIL}" style="color:${BRAND_COLOR};">${ONBOARDING_EMAIL}</a>.</li>
       </ul>
       <p style="margin-top:16px;">We're excited to have you on the road with us. Welcome to the SUPERTRANSPORT family!</p>`,
      { label: 'Go to My Portal', url: `${SAMPLE_APP_URL}/dashboard` },
      ONBOARDING_EMAIL
    ),
  },

  // ── Invitations ────────────────────────────────────────────────────────────
  {
    id: 'invite_applicant',
    category: 'invitations',
    title: 'Applicant Invitation',
    subject: "John, you're invited to apply at SUPERTRANSPORT",
    recipient: 'applicant',
    sender: `${BRAND_NAME} Recruiting <${RECRUITING_EMAIL}>`,
    renderHtml: () => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're Invited to Apply — SUPERTRANSPORT</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_DARK};font-weight:700;">You're Invited to Join Our Team, John!</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">
              <p>We'd love for you to apply to become an owner-operator with <strong>SUPERTRANSPORT</strong>.</p>
              <p>We work with independent trucking professionals who value flexibility, competitive pay, and real support on the road. If you're interested in partnering with us, click below to start your application — it only takes a few minutes.</p>
              <div style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin:20px 0;">
                <p style="margin:0;font-size:14px;color:#555;"><strong>A note from our team:</strong> We heard great things about you — looking forward to your application!</p>
              </div>
              <p style="margin-top:20px;"><strong>What to expect:</strong></p>
              <ul style="padding-left:20px;line-height:2;color:#555;">
                <li>Simple online application form</li>
                <li>Fast review by our onboarding team</li>
                <li>A dedicated coordinator from day one</li>
              </ul>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${SAMPLE_APP_URL}/apply" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                Start Your Application
              </a>
            </div>
            <p style="font-size:13px;color:#999;text-align:center;">Or visit: <a href="${SAMPLE_APP_URL}/apply" style="color:${BRAND_COLOR};">${SAMPLE_APP_URL}/apply</a></p>
          </td>
        </tr>
        ${emailFooter(RECRUITING_EMAIL, 'You received this email because a SUPERTRANSPORT team member personally invited you to apply.')}
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
  {
    id: 'invite_staff',
    category: 'invitations',
    title: 'Staff Invitation',
    subject: "You're invited to join SUPERTRANSPORT as Onboarding Staff",
    recipient: 'staff',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>You're Invited to SUPERTRANSPORT</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader()}
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_DARK};font-weight:700;">You've Been Invited to Join the Team</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">
              <p>Hi ${SAMPLE_NAME},</p>
              <p><strong>Management</strong> has invited you to join the <strong>SUPERTRANSPORT</strong> operations platform as <strong>Onboarding Staff</strong>.</p>
              <p>Click the button below to set up your account and get access to your dashboard.</p>
              <p style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin-top:16px;">
                <strong>Your Role:</strong> Onboarding Staff
              </p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${SAMPLE_APP_URL}/login" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
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
</html>`,
  },
  {
    id: 'invite_operator',
    category: 'invitations',
    title: 'Operator Welcome — Application Approved',
    subject: 'Your SUPERTRANSPORT Application Has Been Approved!',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Your SUPERTRANSPORT Application Has Been Approved!',
      "👍 Congratulations — You've Been Approved!",
      `<p>Dear ${SAMPLE_NAME},</p>
       <p>We are thrilled to let you know that your driver application with <strong>SUPERTRANSPORT</strong> has been <strong>approved</strong>.</p>
       <p>You should receive a separate email shortly with a link to set up your SUPERTRANSPORT account. Once you log in, you'll be able to track your onboarding progress.</p>
       <p>Welcome to the SUPERTRANSPORT family — we're excited to have you on board!</p>
       <p style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin-top:16px;"><strong>Note from our team:</strong> Please complete your profile setup as soon as possible to begin onboarding.</p>`,
      { label: 'Set Up Your Account', url: `${SAMPLE_APP_URL}/login` }
    ),
  },
  {
    id: 'application_denied',
    category: 'invitations',
    title: 'Application Denied',
    subject: 'Update on Your SUPERTRANSPORT Application',
    recipient: 'applicant',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Update on Your SUPERTRANSPORT Application',
      'Application Status Update',
      `<p>Dear ${SAMPLE_NAME},</p>
       <p>Thank you for taking the time to apply with <strong>SUPERTRANSPORT</strong>. After careful review, we are unable to move forward with your application at this time.</p>
       <p style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;"><strong>Reason:</strong> MVR review did not meet current standards.</p>
       <p>We appreciate your interest in SUPERTRANSPORT and wish you the best in your search.</p>
       <p>If you have questions, please reach out to us directly at <a href="mailto:${RECRUITING_EMAIL}" style="color:${BRAND_COLOR};">${RECRUITING_EMAIL}</a>.</p>`
    ),
  },

  {
    id: 'welcome_superdrive',
    category: 'invitations',
    title: 'SUPERDRIVE Launch Invite (Pre-existing Operators)',
    subject: 'Welcome to SUPERDRIVE — Your Operator App Is Ready',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => {
      const recoveryUrl = '#preview';
      const featureCard = (icon: string, title: string, desc: string) => `
        <div style="background:#FAF8F2;border:1px solid #EDE6CF;border-radius:10px;padding:18px;margin:0 0 12px;">
          <p style="margin:0 0 6px;color:${BRAND_DARK};font-size:15px;font-weight:700;">${icon} ${title}</p>
          <p style="margin:0;color:#444;font-size:14px;line-height:1.6;">${desc}</p>
        </div>`;

      const features = [
        featureCard('🔍', 'Inspection Binder', 'Carry your DOT binder in your pocket. CDL, medical card, truck title, inspection report — all one tap away at the scale house.'),
        featureCard('💰', 'Settlement Forecast', "Track projected take-home before settlement day. Add expected loads, log expenses, see your weekly net in real time."),
        featureCard('🚛', 'My Truck', 'Truck specs, photos, plate, VIN, ELD, BestPass, dash cam — logged and ready when dispatch or DOT asks.'),
        featureCard('📍', 'Dispatch Status', 'Update your status (available, on-load, truck-down) and see where your next load is going the moment it\'s assigned.'),
        featureCard('💬', 'Direct Messages', 'Talk one-on-one to dispatch and onboarding without group-text noise.'),
        featureCard('📅', 'Payroll Calendar', 'Wednesday-to-Tuesday work weeks, pay dates, and settlement PDFs always in reach.'),
      ].join('');

      const installCallout = `
        <div style="background:#0f1117;border-radius:10px;padding:20px;margin:24px 0 0;">
          <p style="margin:0 0 10px;color:${BRAND_COLOR};font-size:14px;font-weight:700;letter-spacing:1px;">📱 INSTALL ON YOUR PHONE</p>
          <p style="margin:0 0 14px;color:#cfcfcf;font-size:13px;line-height:1.6;">After setting your password, install SUPERDRIVE to your home screen for one-tap access:</p>
          <p style="margin:0 0 6px;color:#fff;font-size:13px;line-height:1.5;"><strong>iPhone (Safari):</strong> Tap Share → "Add to Home Screen"</p>
          <p style="margin:0;color:#fff;font-size:13px;line-height:1.5;"><strong>Android (Chrome):</strong> Tap menu (⋮) → "Install app"</p>
        </div>`;

      const body = `
        <p style="margin:0 0 14px;">Hi ${SAMPLE_NAME},</p>
        <p>You've been driving with SUPERTRANSPORT for a while — and we built something for you. <strong>SUPERDRIVE</strong> is your new operator app. Your truck, your settlements, your documents — all in one place, always with you.</p>
        <p style="margin:0 0 22px;">Click the button below to set your password and open SUPERDRIVE for the first time.</p>

        <div style="text-align:center;margin:28px 0;">
          <a href="${recoveryUrl}" style="background:${BRAND_COLOR};color:${BRAND_DARK};padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
            Set Your Password &amp; Open SUPERDRIVE
          </a>
        </div>

        <p style="margin:30px 0 14px;color:${BRAND_DARK};font-size:16px;font-weight:700;">Here's what's waiting for you:</p>
        ${features}
        ${installCallout}

        <p style="margin:28px 0 0;color:#777;font-size:13px;line-height:1.6;">Questions? Just reply to this email — we're here.<br/>— The SUPERTRANSPORT team</p>
      `;

      return buildEmail(
        'Welcome to SUPERDRIVE — Your Operator App Is Ready',
        `Welcome to SUPERDRIVE, ${SAMPLE_NAME}`,
        body,
        undefined,
        ONBOARDING_EMAIL
      );
    },
  },

  // ── Compliance Reminders ───────────────────────────────────────────────────
  {
    id: 'cert_expiry_60d_operator',
    category: 'compliance',
    title: 'CDL / Med Cert Expiring (60-day early notice)',
    subject: '📅 Early Reminder: Your CDL Expires in 60 Days',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '📅 Early Reminder: Your CDL Expires in 60 Days',
      '📅 Early Reminder — CDL Expiring in 60 Days',
      `<p>Hi John,</p>
       <p>This is an early heads-up that your <strong>CDL</strong> is set to expire on <strong>Mar 15, 2026</strong> — 60 days from now.</p>
       <p>Getting ahead of this now means less stress later. When your renewed CDL is ready, simply upload it to your operator portal.</p>
       <p style="background:#f0f7ff;border-left:4px solid #3498db;padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>Heads up:</strong> You have 60 days — plenty of time to renew. We recommend starting the process now to avoid any last-minute issues.
       </p>
       <p style="background:#fff8e6;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>How to upload:</strong> Log in to your operator portal → Progress tab → Upload your renewed CDL.
       </p>`,
      { label: 'View My Portal', url: `${SAMPLE_APP_URL}/operator/progress` }
    ),
  },
  {
    id: 'cert_expiry_30d_operator',
    category: 'compliance',
    title: 'CDL / Med Cert Expiring (30-day critical)',
    subject: '⚠️ Action Required: Your CDL Expires in 30 Days',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '⚠️ Action Required: Your CDL Expires in 30 Days',
      '⚠️ Your CDL Expires in 30 Days',
      `<p>Hi John,</p>
       <p>This is an important reminder that your <strong>CDL</strong> is set to expire on <strong>Feb 13, 2026</strong> — 30 days from now.</p>
       <p>To remain compliant and continue operating, please renew your CDL as soon as possible and upload the updated document to your portal.</p>
       <p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>Urgent:</strong> Only 30 days remain. Renew immediately to stay compliant and continue operating.
       </p>
       <p style="background:#fff8e6;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>How to upload:</strong> Log in to your operator portal → Progress tab → Upload your renewed CDL.
       </p>`,
      { label: 'View My Portal', url: `${SAMPLE_APP_URL}/operator/progress` }
    ),
  },
  {
    id: 'cert_expiry_staff',
    category: 'compliance',
    title: 'CDL / Med Cert Expiring (staff copy)',
    subject: '⚠️ Compliance Alert: John Smith — CDL Expiring in 30 Days',
    recipient: 'staff',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '⚠️ Compliance Alert: John Smith — CDL Expiring in 30 Days',
      "⚠️ John Smith's CDL Expires in 30 Days",
      `<p>Hi,</p>
       <p>This is a compliance alert for one of your assigned operators.</p>
       <table style="border-collapse:collapse;width:100%;margin:16px 0;">
         <tr style="background:#f5f5f5;">
           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;width:40%;">Operator</td>
           <td style="padding:10px 14px;border:1px solid #eee;">John Smith</td>
         </tr>
         <tr>
           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Document</td>
           <td style="padding:10px 14px;border:1px solid #eee;">CDL</td>
         </tr>
         <tr style="background:#f5f5f5;">
           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Expires On</td>
           <td style="padding:10px 14px;border:1px solid #eee;color:#c0392b;font-weight:700;">Feb 13, 2026</td>
         </tr>
         <tr>
           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Days Remaining</td>
           <td style="padding:10px 14px;border:1px solid #eee;">30 days</td>
         </tr>
       </table>
       <p>Please follow up with <strong>John Smith</strong> immediately to ensure their CDL is renewed before the expiration date.</p>`,
      { label: 'View Operator Panel', url: `${SAMPLE_APP_URL}/staff` }
    ),
  },
  {
    id: 'cert_expired_manual',
    category: 'compliance',
    title: 'CDL / Med Cert Expired (manual reminder)',
    subject: '🚨 Action Required: Your CDL Has Expired',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '🚨 Action Required: Your CDL Has Expired',
      '🚨 Your CDL Has Expired',
      `<p>Hi John,</p>
       <p>This is a reminder from your SUPERTRANSPORT onboarding coordinator regarding your <strong>CDL</strong>.</p>
       <p>Your CDL expired on <strong>Jan 14, 2026</strong>.</p>
       <p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>Expired 10 days ago.</strong> You must renew your CDL and upload the updated document immediately to remain compliant.
       </p>
       <p style="background:#fff8e6;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>How to upload:</strong> Log in to your operator portal → Progress tab → Upload your renewed CDL.
       </p>`,
      { label: 'View My Portal', url: `${SAMPLE_APP_URL}/operator/progress` }
    ),
  },

  // ── Document Hub ───────────────────────────────────────────────────────────
  {
    id: 'doc_published',
    category: 'documents',
    title: 'New Document Published',
    subject: 'New Document Available: Driver Safety Policy',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'New Document Available: Driver Safety Policy',
      '📄 New Document in Your Doc Hub',
      `<p>A new document has been added to the <strong>Document Hub</strong> and is ready for you to review.</p>
       <div style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin:16px 0;">
         <p style="margin:0;font-weight:700;color:${BRAND_DARK};">Driver Safety Policy</p>
         <p style="color:#666;font-size:14px;font-style:italic;">Updated company-wide safety protocols and procedures.</p>
       </div>
       <p>Log in to your portal and visit the <strong>Doc Hub</strong> tab to read and acknowledge the document.</p>`,
      { label: 'Go to Doc Hub', url: `${SAMPLE_APP_URL}/operator?tab=docs-hub` }
    ),
  },
  {
    id: 'doc_updated',
    category: 'documents',
    title: 'Document Updated',
    subject: 'Document Updated: Driver Safety Policy',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Document Updated: Driver Safety Policy',
      '🔄 A Document Has Been Updated',
      `<p>A document you previously reviewed in the <strong>Document Hub</strong> has been updated with new content.</p>
       <div style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin:16px 0;">
         <p style="margin:0;font-weight:700;color:${BRAND_DARK};">Driver Safety Policy</p>
         <p style="color:#666;font-size:14px;font-style:italic;">Updated company-wide safety protocols and procedures.</p>
       </div>
       <p>Please log in to your portal, open the <strong>Doc Hub</strong> tab, and re-read and re-acknowledge the updated document to stay compliant.</p>`,
      { label: 'Go to Doc Hub', url: `${SAMPLE_APP_URL}/operator?tab=docs-hub` }
    ),
  },
  {
    id: 'doc_reminder',
    category: 'documents',
    title: 'Acknowledgment Reminder',
    subject: 'Reminder: Acknowledge "Driver Safety Policy"',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Reminder: Acknowledge "Driver Safety Policy"',
      '⏰ Action Required — Document Acknowledgment',
      `<p>You have a required document in the <strong>Document Hub</strong> that still needs your acknowledgment.</p>
       <div style="background:#f9f5e9;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin:16px 0;">
         <p style="margin:0;font-weight:700;color:${BRAND_DARK};">Driver Safety Policy</p>
       </div>
       <p>Please log in to your portal, open the <strong>Doc Hub</strong> tab, read the document, and click <strong>Acknowledge</strong> to complete this requirement.</p>`,
      { label: 'Go to Doc Hub', url: `${SAMPLE_APP_URL}/operator?tab=docs-hub` }
    ),
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  {
    id: 'new_application',
    category: 'notifications',
    title: 'New Application Received',
    subject: 'New Application: John Smith',
    recipient: 'management',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'New Application: John Smith',
      '📋 New Driver Application Received',
      `<p>A new driver application has been submitted and is ready for review.</p>
       <p><strong>Name:</strong> John Smith<br><strong>Email:</strong> john.smith@example.com</p>
       <p>Please log in to the Management Portal to review and take action.</p>`,
      { label: 'Review Application', url: `${SAMPLE_APP_URL}/management` }
    ),
  },
  {
    id: 'onboarding_milestone_staff',
    category: 'notifications',
    title: 'Onboarding Milestone (staff copy)',
    subject: 'Onboarding Update: John Smith',
    recipient: 'staff',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Onboarding Update: John Smith',
      '✅ Onboarding Milestone Reached',
      `<p><strong>John Smith</strong> has completed a step in their onboarding process.</p>
       <p><strong>Milestone:</strong> ICA Agreement Signed</p>
       <p>Log in to the Staff Portal to view their full onboarding status.</p>`,
      { label: 'View Pipeline', url: `${SAMPLE_APP_URL}/staff` }
    ),
  },
  {
    id: 'truck_down_operator',
    category: 'notifications',
    title: 'Truck Down Alert (operator copy)',
    subject: '🔴 Action Required — Your Truck is Marked Down',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '🔴 Action Required — Your Truck is Marked Down',
      '🔴 Truck Down — Action Required',
      `<p>Hi John Smith,</p>
       <p>Your dispatch status has been updated to <strong style="color:#b91c1c;">🔴 Truck Down</strong> by your dispatcher.</p>
       <p><strong>Load / Lane:</strong> Dallas → Memphis</p>
       <p style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong>Note from your dispatcher:</strong> ELD issue reported. Please call dispatch.</p>
       <p>Please reach out to your dispatcher as soon as possible to coordinate next steps.</p>
       <p style="margin-top:16px;">You can view your current status and send a message to your dispatcher in your portal.</p>`,
      { label: 'View My Portal', url: `${SAMPLE_APP_URL}/dashboard` }
    ),
  },
  {
    id: 'truck_down_staff',
    category: 'notifications',
    title: 'Truck Down Alert (dispatcher / management)',
    subject: '🔴 Truck Down Alert — John Smith (Unit #42)',
    recipient: 'staff',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      '🔴 Truck Down Alert — John Smith (Unit #42)',
      '🔴 Truck Down Alert',
      `<p>A <strong>Truck Down</strong> status has been recorded for one of your operators. Immediate attention may be required.</p>
       <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff5f5;border-radius:8px;padding:16px;border:1px solid #fecaca;">
         <tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Operator</td><td style="padding:6px 0;font-size:14px;font-weight:600;">John Smith (Unit #42)</td></tr>
         <tr><td style="padding:6px 0;color:#888;font-size:13px;">Status</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#b91c1c;">🔴 Truck Down</td></tr>
         <tr><td style="padding:6px 0;color:#888;font-size:13px;">Load / Lane</td><td style="padding:6px 0;font-size:14px;">Dallas → Memphis</td></tr>
         <tr><td style="padding:6px 0;color:#888;font-size:13px;width:120px;">Notes</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#b91c1c;">ELD issue reported. Please call dispatch.</td></tr>
       </table>
       <p style="font-size:13px;color:#666;">Logged at Jan 23, 2026, 10:45 AM CT</p>`,
      { label: 'Open Dispatch Board', url: `${SAMPLE_APP_URL}/dispatch` }
    ),
  },
  {
    id: 'new_message',
    category: 'notifications',
    title: 'New Message Notification',
    subject: 'New message from Sarah Johnson — SUPERTRANSPORT',
    recipient: 'operator',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'New message from Sarah Johnson — SUPERTRANSPORT',
      '💬 You have a new message',
      `<p>Hi,</p>
       <p><strong>Sarah Johnson</strong> from your onboarding team has sent you a new message:</p>
       <blockquote style="border-left:4px solid ${BRAND_COLOR};padding:12px 16px;margin:16px 0;background:#fdf9ee;border-radius:0 6px 6px 0;color:#444;font-style:italic;">
         "Hi John, just wanted to confirm that your ICA has been received and we're moving forward with MO registration. Should be ready within 2–3 weeks!"
       </blockquote>
       <p>Log in to your portal to read the full message and reply.</p>`,
      { label: 'View Message', url: `${SAMPLE_APP_URL}/dashboard?tab=messages` }
    ),
  },
  {
    id: 'request_ssn',
    category: 'notifications',
    title: 'Request Missing SSN',
    subject: 'Action Needed: Please Update Your Application — SUPERTRANSPORT',
    recipient: 'applicant',
    sender: `${BRAND_NAME} <${ONBOARDING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Action Needed: Please Update Your Application — SUPERTRANSPORT',
      '📋 Action Needed — Update Your Application',
      `<p>Dear ${SAMPLE_NAME},</p>
       <p>Thank you for submitting your driver application with <strong>SUPERTRANSPORT</strong>.</p>
       <p>We experienced a minor technical issue during the submission process, and unfortunately your <strong>Social Security Number</strong> was not captured. We sincerely apologize for the inconvenience.</p>
       <p>To complete your application, please click the button below. You will be taken to a secure page where you can enter your SSN — no need to re-fill your entire application.</p>
       <p>Your information is encrypted and stored securely. This should only take a moment.</p>
       <p style="margin-top:16px;">If you have any questions or need assistance, please reach out to us at <a href="mailto:${ONBOARDING_EMAIL}" style="color:${BRAND_COLOR};">${ONBOARDING_EMAIL}</a>.</p>
       <p>Thank you for your patience and understanding!</p>`,
      { label: 'Update My Application', url: `${SAMPLE_APP_URL}/apply/ssn?id=sample-app-id` },
      ONBOARDING_EMAIL
    ),
  },
  {
    id: 'application_moved_to_pending',
    category: 'notifications',
    title: 'Application Reopened (Moved to Pending)',
    subject: 'Update on your SUPERTRANSPORT driver application',
    recipient: 'applicant',
    sender: `${BRAND_NAME} <${RECRUITING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Update on your SUPERTRANSPORT driver application',
      'Application Reopened',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Good news — our team is reviewing your SUPERTRANSPORT driver application and has reopened it so we can take care of a few small corrections on your behalf.</p>
       <div style="margin:0 0 18px;padding:14px 16px;background:#f1f8ff;border-left:4px solid #2c7be5;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
         <p style="margin:0 0 6px;font-weight:700;color:#1a4d8f;">What happens next</p>
         <p style="margin:0;">If any changes need your approval, you'll receive a separate email with a secure link to review and e-sign them.</p>
       </div>
       <p>Any earlier "please update your application" link has been retired and will no longer work — please disregard it.</p>`,
      undefined,
      RECRUITING_EMAIL
    ),
  },
  {
    id: 'application_correction_request',
    category: 'notifications',
    title: 'Suggested Corrections — Approval Needed',
    subject: 'Action needed: approve corrections to your SUPERTRANSPORT application',
    recipient: 'applicant',
    sender: `${BRAND_NAME} <${RECRUITING_EMAIL}>`,
    renderHtml: () => buildEmail(
      'Action needed: approve corrections to your SUPERTRANSPORT application',
      'Corrections Awaiting Approval',
      `<p>Hi ${SAMPLE_NAME},</p>
       <p>Our team has prepared a few corrections to your SUPERTRANSPORT driver application and needs your approval before they take effect.</p>
       <div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
         <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">Reason for these corrections:</p>
         <p style="margin:0;">Date of birth was off by one day on your MVR.</p>
       </div>
       <p style="margin:18px 0 8px;font-weight:700;">Proposed changes</p>
       <p style="color:#666;font-size:13px;">[Field-by-field comparison table is generated automatically]</p>
       <p>Click below to review the changes side-by-side and either approve them with your e-signature or reject them.</p>`,
      { label: 'Review & approve changes', url: `${SAMPLE_APP_URL}/application/approve/sample-token` },
      RECRUITING_EMAIL
    ),
  },
];

// ─── Category helpers ─────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<Category | 'all', string> = {
  all:           'All',
  onboarding:    'Onboarding',
  invitations:   'Invitations',
  compliance:    'Compliance',
  documents:     'Documents',
  notifications: 'Notifications',
};

const RECIPIENT_STYLES: Record<Recipient, { label: string; className: string }> = {
  operator:   { label: 'Operator',   className: 'bg-primary/10 text-primary border-primary/20' },
  staff:      { label: 'Staff',      className: 'bg-gold/10 text-gold border-gold/20' },
  applicant:  { label: 'Applicant',  className: 'bg-info/10 text-info border-info/20' },
  management: { label: 'Management', className: 'bg-status-complete/10 text-status-complete border-status-complete/20' },
};

const CATEGORY_COUNT = (cat: Category) => TEMPLATES.filter(t => t.category === cat).length;

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailCatalog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // ── Editable DB templates ────────────────────────────────────────────────
  // Maps milestone_key → { subject, heading, body_html, cta_label }
  const [dbTemplates, setDbTemplates] = useState<Record<string, { subject: string; heading: string; body_html: string; cta_label: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ subject: '', heading: '', body_html: '', cta_label: '' });
  const [saving, setSaving] = useState(false);

  // Which template IDs are editable (have a DB record)
  const EDITABLE_MILESTONE_KEYS = ['mo_reg_filed', 'application_moved_to_pending', 'application_correction_request'];

  const fetchDbTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('email_templates')
      .select('milestone_key, subject, heading, body_html, cta_label');
    if (data) {
      const map: Record<string, { subject: string; heading: string; body_html: string; cta_label: string }> = {};
      data.forEach(row => { map[row.milestone_key] = row; });
      setDbTemplates(map);
    }
  }, []);

  useEffect(() => { fetchDbTemplates(); }, [fetchDbTemplates]);

  const handleOpenEdit = (templateId: string) => {
    const dbRow = dbTemplates[templateId];
    if (dbRow) {
      setEditForm({ subject: dbRow.subject, heading: dbRow.heading, body_html: dbRow.body_html, cta_label: dbRow.cta_label });
    }
    setEditingId(templateId);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: editForm.subject,
          heading: editForm.heading,
          body_html: editForm.body_html,
          cta_label: editForm.cta_label,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('milestone_key', editingId);
      if (error) throw error;
      toast({ title: 'Email template saved', description: 'Your changes are live and will be used for future emails.' });
      await fetchDbTemplates();
      setEditingId(null);
    } catch (err) {
      toast({ title: 'Failed to save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!editingId) return;
    const defaultTemplate = TEMPLATES.find(t => t.id === editingId);
    if (!defaultTemplate) return;
    // Extract default values from the hardcoded MILESTONE_COPY equivalent
    const defaults: Record<string, { subject: string; heading: string; body_html: string; cta_label: string }> = {
      mo_reg_filed: {
        subject: 'Missouri Registration Filed — SUPERTRANSPORT',
        heading: '📋 Missouri Registration Submitted',
        body_html: '<p>Hi {{name}},</p><p>Your <strong>Missouri apportioned registration</strong> documents have been submitted to the state on your behalf.</p><p>State approval typically takes <strong>2–4 weeks</strong>. We\'ll notify you as soon as it\'s received.</p><p>In the meantime, you can check your onboarding status in your portal.</p>',
        cta_label: 'View My Onboarding Progress',
      },
      application_moved_to_pending: {
        subject: 'Update on your SUPERTRANSPORT driver application',
        heading: 'Application Reopened',
        body_html: `<p>Hi {{name}},</p>
<p>Good news — our team is reviewing your SUPERTRANSPORT driver application and has reopened it so we can take care of a few small corrections on your behalf.</p>
<div style="margin:0 0 18px;padding:14px 16px;background:#f1f8ff;border-left:4px solid #2c7be5;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 6px;font-weight:700;color:#1a4d8f;">What happens next</p>
  <p style="margin:0;">If any changes need your approval, you'll receive a separate email with a secure link to review and e-sign them. You don't need to log back in or resubmit anything right now.</p>
</div>
<p>Any earlier "please update your application" link we sent you has been retired and will no longer work — please disregard it.</p>
<p style="color:#666;font-size:13px;">Questions? Just reply to this email and our recruiting team will get back to you.</p>`,
        cta_label: '',
      },
      application_correction_request: {
        subject: 'Action needed: approve corrections to your SUPERTRANSPORT application',
        heading: 'Corrections Awaiting Approval',
        body_html: `<p>Hi {{name}},</p>
<p>Our team has prepared a few corrections to your SUPERTRANSPORT driver application and needs your approval before they take effect.</p>
{{courtesy_block}}
<div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">Reason for these corrections:</p>
  <p style="margin:0;">{{reason}}</p>
</div>
<p style="margin:18px 0 8px;font-weight:700;">Proposed changes</p>
{{changes_table}}
<p>Click below to review the changes side-by-side and either approve them with your e-signature or reject them.</p>
<p style="color:#666;font-size:13px;">This secure link is valid for <strong>14 days</strong>. If you have questions, reply to this email.</p>`,
        cta_label: 'Review & approve changes',
      },
    };
    const def = defaults[editingId];
    if (def) setEditForm(def);
  };

  // Build preview HTML using DB values when available
  const getPreviewHtml = (template: EmailTemplate): string => {
    const dbRow = dbTemplates[template.id];
    if (dbRow) {
      const bodyWithName = substitutePreview(dbRow.body_html);
      const footerEmail = template.id === 'application_moved_to_pending' || template.id === 'application_correction_request'
        ? RECRUITING_EMAIL
        : ONBOARDING_EMAIL;
      const ctaLabel = (dbRow.cta_label ?? '').trim();
      const cta = ctaLabel ? { label: ctaLabel, url: `${SAMPLE_APP_URL}/dashboard` } : undefined;
      return buildEmail(
        substitutePreview(dbRow.subject),
        dbRow.heading,
        bodyWithName,
        cta,
        footerEmail
      );
    }
    return template.renderHtml();
  };

  const filtered = activeCategory === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === activeCategory);

  const handleSendTest = async (template: EmailTemplate) => {
    if (!user) return;
    setSendingId(template.id);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/send-test-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            subject: dbTemplates[template.id]?.subject || template.subject,
            html: getPreviewHtml(template),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setSentIds(prev => new Set([...prev, template.id]));
      toast({
        title: 'Test email sent',
        description: `Sent to ${data.sentTo}`,
      });
      // Reset checkmark after 5 s
      setTimeout(() => setSentIds(prev => {
        const next = new Set(prev);
        next.delete(template.id);
        return next;
      }), 5000);
    } catch (err) {
      toast({
        title: 'Failed to send test email',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSendingId(null);
    }
  };

  const APP_PAGES = [
    {
      name: 'Splash Page',
      description: 'The branded public landing page applicants see before starting their application.',
      route: '/splash',
      icon: <Globe className="h-5 w-5 text-primary" />,
    },
    {
      name: 'Welcome Operator',
      description: 'The password setup page for newly invited operators joining the platform.',
      route: '/welcome',
      icon: <UserPlus className="h-5 w-5 text-primary" />,
    },
    {
      name: 'Application Form',
      description: 'The multi-step CDL driver application form with document uploads and e-signature.',
      route: '/apply',
      icon: <FileEdit className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Content Manager</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse app pages and automated email templates
        </p>
      </div>

      <Tabs defaultValue="emails" className="space-y-4">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="emails" className="gap-2 text-sm">
            <Mail className="h-4 w-4" />
            Emails
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full bg-background/60 px-1">
              {TEMPLATES.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-2 text-sm">
            <Globe className="h-4 w-4" />
            Pages
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full bg-background/60 px-1">
              {APP_PAGES.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {APP_PAGES.map(page => (
              <Card key={page.route} className="flex flex-col hover:shadow-md transition-shadow">
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {page.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{page.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{page.route}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{page.description}</p>
                  <div className="mt-auto pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-xs w-full"
                      onClick={() => window.open(page.route, '_blank')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Preview Page
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="emails" className="space-y-4">

      {/* Category filter tabs */}
      <Tabs value={activeCategory} onValueChange={v => setActiveCategory(v as Category | 'all')}>
        <TabsList className="flex-wrap h-auto gap-1 bg-muted p-1">
          {(Object.entries(CATEGORY_LABELS) as [Category | 'all', string][]).map(([key, label]) => (
            <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
              {label}
              {key !== 'all' && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full bg-background/60 px-1">
                  {CATEGORY_COUNT(key as Category)}
                </span>
              )}
              {key === 'all' && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full bg-background/60 px-1">
                  {TEMPLATES.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Template grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map(template => {
          const recipientStyle = RECIPIENT_STYLES[template.recipient];
          const isSending = sendingId === template.id;
          const isSent = sentIds.has(template.id);
          return (
            <div
              key={template.id}
              className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{template.title}</p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 font-semibold border ${recipientStyle.className}`}
                >
                  {recipientStyle.label}
                </Badge>
              </div>

              {/* Subject */}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Subject</p>
                <p className="text-xs text-foreground leading-snug line-clamp-2">{template.subject}</p>
              </div>

              {/* Sender */}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">From</p>
                <p className="text-xs text-muted-foreground leading-snug truncate">{template.sender}</p>
              </div>

              {/* Action buttons */}
              <div className="mt-auto flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-2 text-xs"
                    onClick={() => setPreviewTemplate(template)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`flex-1 gap-2 text-xs transition-colors ${isSent ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`}
                    disabled={isSending || !!sendingId}
                    onClick={() => handleSendTest(template)}
                  >
                    {isSending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                    ) : isSent ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" />Sent!</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" />Send Test</>
                    )}
                  </Button>
                </div>
                {EDITABLE_MILESTONE_KEYS.includes(template.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-xs w-full border-gold/40 text-gold hover:bg-gold/10"
                    onClick={() => handleOpenEdit(template.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Template
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      <Dialog open={!!previewTemplate} onOpenChange={open => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="text-base font-semibold leading-tight">
              {previewTemplate?.title}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {previewTemplate && (
                <>
                  <Badge variant="outline" className={`text-[10px] font-semibold border ${RECIPIENT_STYLES[previewTemplate.recipient].className}`}>
                    → {RECIPIENT_STYLES[previewTemplate.recipient].label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-medium border-border text-muted-foreground">
                    From: {previewTemplate.sender}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-medium border-border text-muted-foreground max-w-xs truncate">
                    Subject: {dbTemplates[previewTemplate.id]?.subject || previewTemplate.subject}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`ml-auto gap-2 text-xs h-7 px-3 transition-colors ${sentIds.has(previewTemplate.id) ? 'border-green-500 text-green-600 hover:bg-green-50' : ''}`}
                    disabled={sendingId === previewTemplate.id || (!!sendingId && sendingId !== previewTemplate.id)}
                    onClick={() => handleSendTest(previewTemplate)}
                  >
                    {sendingId === previewTemplate.id ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
                    ) : sentIds.has(previewTemplate.id) ? (
                      <><CheckCircle2 className="h-3 w-3" />Sent to your inbox!</>
                    ) : (
                      <><Send className="h-3 w-3" />Send Test to My Inbox</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 bg-muted/30">
            {previewTemplate && (
              <iframe
                srcDoc={getPreviewHtml(previewTemplate)}
                title={previewTemplate.title}
                className="w-full rounded-lg border border-border bg-white"
                style={{ height: '600px', minHeight: '400px' }}
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit template modal */}
      <Dialog open={!!editingId} onOpenChange={open => { if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-gold" />
              Edit Email Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-subject" className="text-sm font-medium">Subject Line</Label>
              <Input
                id="edit-subject"
                value={editForm.subject}
                onChange={e => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject line"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-heading" className="text-sm font-medium">Email Heading</Label>
              <Input
                id="edit-heading"
                value={editForm.heading}
                onChange={e => setEditForm(prev => ({ ...prev, heading: e.target.value }))}
                placeholder="e.g. 📋 Missouri Registration Submitted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-body" className="text-sm font-medium">
                Body HTML
                <span className="text-muted-foreground font-normal ml-2 text-xs">
                  Use {'{{name}}'} for the operator's name
                </span>
              </Label>
              <Textarea
                id="edit-body"
                value={editForm.body_html}
                onChange={e => setEditForm(prev => ({ ...prev, body_html: e.target.value }))}
                placeholder="<p>Hi {{name}},</p><p>Your email content here...</p>"
                className="font-mono text-xs min-h-[200px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cta" className="text-sm font-medium">Button Label</Label>
              <Input
                id="edit-cta"
                value={editForm.cta_label}
                onChange={e => setEditForm(prev => ({ ...prev, cta_label: e.target.value }))}
                placeholder="e.g. View My Onboarding Progress"
              />
            </div>

            {/* Live preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Live Preview</Label>
              <iframe
                srcDoc={buildEmail(
                  editForm.subject,
                  editForm.heading,
                  editForm.body_html.replace(/\{\{name\}\}/g, SAMPLE_NAME).replace(/\{\{extra\}\}/g, SAMPLE_DATE),
                  { label: editForm.cta_label, url: `${SAMPLE_APP_URL}/dashboard` },
                  ONBOARDING_EMAIL
                )}
                title="Edit Preview"
                className="w-full rounded-lg border border-border bg-white"
                style={{ height: '400px' }}
                sandbox="allow-same-origin"
              />
            </div>

            <div className="flex gap-2 justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={handleResetToDefault}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Default
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button
                  size="sm"
                  className="gap-2 bg-gold text-surface-dark hover:bg-gold/90"
                  disabled={saving}
                  onClick={handleSaveEdit}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
