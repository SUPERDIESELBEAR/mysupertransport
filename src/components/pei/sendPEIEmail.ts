import { supabase } from '@/integrations/supabase/client';

/**
 * Sends a Previous Employer Investigation email through the Lovable Cloud
 * transactional email pipeline (notify.mysupertransport.com), then advances
 * the pei_requests row's status and stamps the corresponding send date.
 *
 * Loud failure: if the email cannot be enqueued (missing contact email,
 * suppressed address, infrastructure error), we throw and DO NOT advance
 * the request status, so staff aren't misled into thinking it went out.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEMPLATE_BY_KIND: Record<
  'initial' | 'follow_up' | 'final_notice',
  string
> = {
  initial: 'pei-request-initial',
  follow_up: 'pei-request-follow-up',
  final_notice: 'pei-request-final-notice',
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Anchor at noon to avoid TZ drift for YYYY-MM-DD strings.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' });
}

function fmtDeadline(value: string | null | undefined): string {
  if (!value) return 'within 30 days of receipt';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'within 30 days of receipt';
  return `by ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

export async function sendPEIEmail(
  requestId: string,
  kind: 'initial' | 'follow_up' | 'final_notice'
): Promise<void> {
  // 1. Load the request + applicant context.
  const { data: reqRow, error: loadError } = await supabase
    .from('pei_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (loadError) throw loadError;
  if (!reqRow) throw new Error('PEI request not found');
  const req = reqRow as any;

  const recipient = (req.employer_contact_email || '').trim().toLowerCase();
  if (!recipient || !EMAIL_RE.test(recipient)) {
    throw new Error(
      'Previous employer email address is missing or invalid. Add it before sending.'
    );
  }

  // Pull applicant name (best-effort).
  const { data: app } = await supabase
    .from('applications')
    .select('first_name, last_name')
    .eq('id', req.application_id)
    .maybeSingle();
  const applicantName =
    [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() ||
    'the applicant';

  // 2. Compute days remaining for follow-up / final notice templates.
  let daysRemaining: number | undefined;
  if (req.deadline_date) {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(req.deadline_date)
      ? `${req.deadline_date}T12:00:00`
      : req.deadline_date;
    const ms = new Date(iso).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  // Never let preview/sandbox origins leak into outbound emails — those
  // hosts (lovableproject.com, id-preview--*.lovable.app) require a Lovable
  // login and would block the previous employer recipient.
  const PUBLISHED_ORIGIN = 'https://mysupertransport.lovable.app';
  const rawOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : PUBLISHED_ORIGIN;
  const isPreviewOrigin =
    /lovableproject\.com$/i.test(new URL(rawOrigin).hostname) ||
    /\.lovable\.app$/i.test(new URL(rawOrigin).hostname) === false
      ? false
      : /^id-preview--/i.test(new URL(rawOrigin).hostname);
  const safeOrigin =
    /lovableproject\.com$/i.test(new URL(rawOrigin).hostname) || isPreviewOrigin
      ? PUBLISHED_ORIGIN
      : rawOrigin;
  const responseUrl = `${safeOrigin.replace(/\/$/, '')}/pei/respond/${req.response_token}`;

  const templateData = {
    applicantName,
    employerName: req.employer_name,
    contactName: req.employer_contact_name || undefined,
    employmentStartDate: fmtDate(req.employment_start_date),
    employmentEndDate: fmtDate(req.employment_end_date),
    responseUrl,
    deadlineDate: fmtDeadline(req.deadline_date),
    daysRemaining,
  };

  // 3. Invoke send-transactional-email (queue-backed, idempotent).
  const { data: sendResult, error: sendError } = await supabase.functions.invoke(
    'send-transactional-email',
    {
      body: {
        templateName: TEMPLATE_BY_KIND[kind],
        recipientEmail: recipient,
        idempotencyKey: `pei-${requestId}-${kind}`,
        templateData,
      },
    }
  );
  if (sendError) throw sendError;

  const messageId =
    (sendResult && (sendResult.messageId || sendResult.message_id)) || null;

  // 4. Advance status + stamp dates.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    kind === 'initial'
      ? { status: 'sent', date_sent: now }
      : kind === 'follow_up'
        ? { status: 'follow_up_sent', date_follow_up_sent: now }
        : { status: 'final_notice_sent', date_final_notice_sent: now };
  if (messageId) patch.last_email_message_id = messageId;

  const { error: updateError } = await supabase
    .from('pei_requests')
    .update(patch as any)
    .eq('id', requestId);
  if (updateError) throw updateError;
}