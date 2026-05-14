import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';

// Client-side mirror of the React Email templates that the
// `send-transactional-email` edge function actually sends. This is a
// read-only preview so staff can review wording without leaving the app.
// Sending is unaffected by this file.

const SAMPLE = {
  applicantName: 'James Whitaker',
  employerName: 'Acme Trucking LLC',
  contactName: 'Safety Manager',
  start: '03/2021',
  end: '08/2024',
  url: 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN',
  deadline: 'within 30 days of receipt',
  daysRemaining: 15,
};

const BRAND_GOLD = '#C9A84C';
const BRAND_DARK = '#0F0F0F';

function shell(inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:24px;background:#F5F5F5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <p style="font-size:14px;font-weight:bold;color:${BRAND_DARK};letter-spacing:.18em;margin:0 0 12px;">SUPERTRANSPORT</p>
      ${inner}
      <p style="font-size:11px;color:#999;margin:32px 0 0;border-top:1px solid #EAEAEA;padding-top:12px;">
        You received this email because SUPERTRANSPORT is investigating an applicant who listed your company as a previous employer (49 CFR §391.23). To stop receiving these compliance emails: <a href="https://mysupertransport.lovable.app/unsubscribe?token=SAMPLE" style="color:${BRAND_GOLD};">Unsubscribe</a>.
      </p>
    </div>
  </body></html>`;
}

function factsTable(extra?: { label: string; value: string }) {
  const rows = [
    { label: 'Driver name', value: SAMPLE.applicantName },
    { label: 'Employer', value: SAMPLE.employerName },
    { label: 'Start date', value: SAMPLE.start },
    { label: 'End date', value: SAMPLE.end },
  ];
  if (extra) rows.push(extra);
  return `<table style="width:100%;border-collapse:separate;margin:8px 0 16px;background:#FAF8F2;border:1px solid #EDE6CF;border-radius:6px;">
    <tbody>
      ${rows
        .map(
          (r, i) => `<tr>
        <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#5A4A1F;width:40%;${i < rows.length - 1 ? 'border-bottom:1px solid #EDE6CF;' : ''}">${r.label}</td>
        <td style="padding:10px 14px;font-size:13px;color:${BRAND_DARK};${i < rows.length - 1 ? 'border-bottom:1px solid #EDE6CF;' : ''}">${r.value}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

function ctaButton(): string {
  return `<a href="${SAMPLE.url}" style="background:${BRAND_GOLD};color:${BRAND_DARK};padding:14px 26px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Complete the investigation →</a>`;
}

function initialHtml(): string {
  return shell(`
    <p style="font-size:11px;color:#7A7A7A;letter-spacing:.14em;margin:0 0 18px;">COMPLIANCE — DRIVER QUALIFICATION</p>
    <div style="width:48px;height:3px;background:${BRAND_GOLD};margin:0 0 24px;"></div>
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 8px;">Previous Employer Investigation Request</h1>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">Dear ${SAMPLE.contactName},</p>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;"><strong>${SAMPLE.applicantName}</strong> has applied for a commercial driving position with <strong>SUPERTRANSPORT</strong> and has listed <strong>${SAMPLE.employerName}</strong> as a previous DOT-regulated employer. Federal regulations <strong>49 CFR §391.23</strong> require us to investigate the applicant&rsquo;s safety performance history with each DOT-regulated employer over the past three years.</p>
    <h2 style="font-size:15px;color:${BRAND_DARK};margin:24px 0 8px;">Employment claimed by applicant</h2>
    ${factsTable()}
    <h2 style="font-size:15px;color:${BRAND_DARK};margin:24px 0 8px;">Please respond securely online</h2>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">Click the button below to complete the investigation form. The response link is unique to this request and the applicant has signed a release authorizing you to share this information.</p>
    ${ctaButton()}
    <div style="background:#FFF7E6;border:1px solid #F0D78C;border-left:4px solid ${BRAND_GOLD};border-radius:4px;padding:12px 16px;margin:16px 0;font-size:13px;color:${BRAND_DARK};line-height:1.55;">
      <strong>Response requested:</strong> ${SAMPLE.deadline}.<br />
      We are required to attempt this contact at least twice before documenting a Good Faith Effort.
    </div>
    <h2 style="font-size:15px;color:${BRAND_DARK};margin:24px 0 8px;">What we ask about</h2>
    <p style="font-size:12px;color:#7A7A7A;line-height:1.5;margin:0 0 12px;">Dates of employment, equipment operated, accident history, drug &amp; alcohol testing history (per §40.25), and overall safety performance.</p>
  `);
}

function followUpHtml(): string {
  return shell(`
    <p style="font-size:11px;color:#7A7A7A;letter-spacing:.14em;margin:0 0 18px;">COMPLIANCE — FOLLOW-UP NOTICE</p>
    <div style="width:48px;height:3px;background:${BRAND_GOLD};margin:0 0 24px;"></div>
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 8px;">Friendly reminder — PEI response needed</h1>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">Dear ${SAMPLE.contactName},</p>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">We previously contacted you regarding <strong>${SAMPLE.applicantName}</strong>&rsquo;s application. We have not yet received your Previous Employer Investigation response, which is required by <strong>49 CFR §391.23</strong>.</p>
    ${factsTable({ label: 'Days remaining', value: String(SAMPLE.daysRemaining) })}
    ${ctaButton()}
    <div style="background:#FFF7E6;border:1px solid #F0D78C;border-left:4px solid ${BRAND_GOLD};border-radius:4px;padding:12px 16px;margin:16px 0;font-size:13px;color:${BRAND_DARK};line-height:1.55;">
      Your prompt response keeps this driver&rsquo;s qualification on track. The applicant has already signed a release authorizing you to share this information.
    </div>
  `);
}

function finalHtml(): string {
  return shell(`
    <p style="font-size:11px;color:#7A7A7A;letter-spacing:.14em;margin:0 0 18px;">COMPLIANCE — FINAL NOTICE</p>
    <div style="width:48px;height:3px;background:${BRAND_GOLD};margin:0 0 24px;"></div>
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 8px;">Final notice — Good Faith Effort pending</h1>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">Dear ${SAMPLE.contactName},</p>
    <p style="font-size:14px;color:#3F3F3F;line-height:1.6;margin:0 0 14px;">This is our <strong>final outreach</strong> regarding <strong>${SAMPLE.applicantName}</strong>&rsquo;s Previous Employer Investigation. We have attempted to reach you twice without a response.</p>
    ${factsTable()}
    <div style="background:#FFF1F0;border:1px solid #F5C6C2;border-left:4px solid #C8341E;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:13px;color:${BRAND_DARK};line-height:1.55;">
      <strong>If we do not receive a response within 5 days,</strong> we will document a <strong>Good Faith Effort</strong> under 49 CFR §391.23(c)(2) and proceed with the applicant&rsquo;s qualification file based on the information available.
    </div>
    <h2 style="font-size:15px;color:${BRAND_DARK};margin:24px 0 8px;">You can still respond now</h2>
    ${ctaButton()}
  `);
}

const TABS = [
  {
    key: 'initial',
    label: 'Initial',
    when: 'Sent immediately when staff clicks "Send"',
    subject: `FMCSA Previous Employer Verification — ${SAMPLE.applicantName}`,
    render: initialHtml,
  },
  {
    key: 'follow-up',
    label: 'Follow-up (~Day 15)',
    when: 'Sent if no response after ~15 days',
    subject: `Reminder: PEI response needed — ${SAMPLE.applicantName}`,
    render: followUpHtml,
  },
  {
    key: 'final',
    label: 'Final notice (~Day 25)',
    when: 'Sent at ~day 25 — warns GFE will be filed at day 30',
    subject: `FINAL NOTICE: PEI response required — ${SAMPLE.applicantName}`,
    render: finalHtml,
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function PEITemplateViewer({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState('initial');
  const previews = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, t.render()])),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gold" />
            PEI Email Templates
          </DialogTitle>
          <DialogDescription>
            Read-only preview of the three emails sent to previous employers
            from <code>compliance@notify.mysupertransport.com</code>. Sample
            data shown — actual sends use real applicant and employer info.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="flex-1 overflow-hidden flex flex-col mt-3">
              <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-sm">
                <Badge variant="outline" className="font-mono text-xs">
                  Subject
                </Badge>
                <span className="text-muted-foreground">{t.subject}</span>
              </div>
              <p className="text-xs text-muted-foreground px-1 pb-2">{t.when}</p>
              <div className="flex-1 overflow-hidden border rounded-md bg-white">
                <iframe
                  title={t.label}
                  srcDoc={previews[t.key]}
                  className="w-full h-[60vh] border-0"
                  sandbox=""
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-end pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}