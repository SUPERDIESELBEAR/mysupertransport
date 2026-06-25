import { useEffect, useState } from 'react';
import { Loader2, Printer, ShieldCheck, FileWarning, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchPEIResponse, fetchPEIAccidents, fetchPEIRequestEvents } from '@/lib/pei/api';
import { GFE_REASON_LABEL, type PEIRequest, type PEIResponse, type PEIAccident, type PEIRequestEvent } from '@/lib/pei/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  request: PEIRequest | null;
  onClose: () => void;
}

export function PEIResponseViewer({ open, request, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PEIResponse | null>(null);
  const [accidents, setAccidents] = useState<PEIAccident[]>([]);
  const [applicantName, setApplicantName] = useState('');
  const [events, setEvents] = useState<PEIRequestEvent[]>([]);
  const { toast } = useToast();

  /**
   * The viewer lives in a scroll-clipped Radix dialog, so `window.print()`
   * truncates everything outside the visible viewport. Render the full record
   * into a dedicated popup window and print from there instead.
   */
  const handlePrint = () => {
    try {
      if (!request) return;
      const html = buildPrintHtml({
        request,
        response,
        accidents,
        events,
        applicantName,
      });
      const win = window.open('', '_blank', 'width=900,height=1000');
      if (!win) throw new Error('popup blocked');
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Wait for layout, then trigger print. Close on afterprint or fallback timer.
      const trigger = () => {
        try {
          win.focus();
          win.print();
        } catch (e) {
          console.error('Print window print() failed:', e);
        }
      };
      win.onafterprint = () => win.close();
      if (win.document.readyState === 'complete') {
        setTimeout(trigger, 50);
      } else {
        win.addEventListener('load', () => setTimeout(trigger, 50));
      }
    } catch (err) {
      console.error('Print failed:', err);
      toast({
        title: 'Print unavailable',
        description: 'Allow pop-ups for this site, or use ⌘P / Ctrl+P to print.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!open || !request) return;
    setLoading(true);
    (async () => {
      try {
        const r = await fetchPEIResponse(request.id);
        setResponse(r);
        if (r) setAccidents(await fetchPEIAccidents(r.id));
        else setAccidents([]);
        try {
          setEvents(await fetchPEIRequestEvents(request.id));
        } catch {
          setEvents([]);
        }
        const { data } = await supabase
          .from('applications')
          .select('first_name, last_name')
          .eq('id', request.application_id)
          .maybeSingle();
        setApplicantName([data?.first_name, data?.last_name].filter(Boolean).join(' '));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, request]);

  if (!request) return null;

  const isGFE = request.status === 'gfe_documented';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isGFE ? <FileWarning className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
            PEI Record — {request.employer_name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : (
          <div id="pei-record-print" className="space-y-5">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Applicant: {applicantName || '—'}</Badge>
              {request.employment_start_date && <Badge variant="outline">Claimed: {request.employment_start_date} → {request.employment_end_date ?? 'present'}</Badge>}
              <Badge variant="outline">Status: {request.status}</Badge>
            </div>

            {isGFE ? (
              <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sm">Good Faith Effort Documented</h3>
                <Field label="Reason" value={request.gfe_reason ? GFE_REASON_LABEL[request.gfe_reason] : '—'} />
                {request.gfe_other_reason && <Field label="Details" value={request.gfe_other_reason} />}
                <Field label="Documented by" value={request.gfe_signed_by_name ?? '—'} />
                <Field label="Date" value={request.date_gfe_created ? new Date(request.date_gfe_created).toLocaleDateString() : '—'} />
                <p className="text-xs text-muted-foreground pt-2 border-t border-amber-200 dark:border-amber-900">
                  Per 49 CFR §391.23(c)(2), this record satisfies the good-faith effort requirement.
                </p>
              </section>
            ) : response ? (
              <>
                <Section title="Employment Verification">
                  <Field label="Was employed" value={fmtBool(response.was_employed)} />
                  <Field label="Dates accurate" value={fmtBool(response.dates_accurate)} />
                  {response.actual_start_date && <Field label="Actual start" value={response.actual_start_date} />}
                  {response.actual_end_date && <Field label="Actual end" value={response.actual_end_date} />}
                  <Field label="Safe & efficient" value={fmtBool(response.safe_and_efficient)} />
                  <Field label="Reason for leaving" value={response.reason_for_leaving ?? '—'} />
                  {response.reason_detail && <Field label="Details" value={response.reason_detail} />}
                </Section>

                <Section title="Equipment & Trailers">
                  <Field label="Equipment" value={[
                    response.equipment_straight_truck && 'Straight truck',
                    response.equipment_tractor_semi && 'Tractor/Semi',
                    response.equipment_bus && 'Bus',
                  ].filter(Boolean).join(', ') || '—'} />
                  <Field label="Trailers" value={[
                    response.trailer_van && 'Van',
                    response.trailer_flatbed && 'Flatbed',
                    response.trailer_reefer && 'Reefer',
                    response.trailer_cargo_tank && 'Cargo tank',
                    response.trailer_triples && 'Triples',
                    response.trailer_doubles && 'Doubles',
                    response.trailer_na && 'N/A',
                  ].filter(Boolean).join(', ') || '—'} />
                </Section>

                <Section title="Accidents">
                  <Field label="Had accidents" value={fmtBool(response.had_accidents)} />
                  {accidents.length > 0 && (
                    <ul className="text-sm space-y-1 mt-1">
                      {accidents.map(a => (
                        <li key={a.id} className="border-l-2 border-amber-400 pl-2">
                          {a.accident_date ?? '—'} · {a.location_city_state ?? '—'} · injuries {a.number_of_injuries ?? 0} · fatalities {a.number_of_fatalities ?? 0}{a.hazmat_spill ? ' · HazMat' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Drug & Alcohol">
                  <Field label="Violation" value={fmtBool(response.drug_alcohol_violation)} />
                  {response.drug_alcohol_violation && (
                    <>
                      <Field label="Failed SAP rehab" value={fmtBool(response.failed_rehab)} />
                      <Field label="Post-rehab violations" value={fmtBool(response.post_rehab_violations)} />
                      {response.drug_alcohol_notes && <Field label="Notes" value={response.drug_alcohol_notes} />}
                    </>
                  )}
                </Section>

                <Section title="Performance Ratings">
                  <Field label="Quality of work" value={response.rating_quality_of_work ?? '—'} />
                  <Field label="Cooperation" value={response.rating_cooperation ?? '—'} />
                  <Field label="Safety habits" value={response.rating_safety_habits ?? '—'} />
                  <Field label="Personal habits" value={response.rating_personal_habits ?? '—'} />
                  <Field label="Driving skills" value={response.rating_driving_skills ?? '—'} />
                  <Field label="Attitude" value={response.rating_attitude ?? '—'} />
                </Section>

                <Section title="Responder">
                  <Field label="Name" value={response.responder_name} />
                  <Field label="Title" value={response.responder_title ?? '—'} />
                  <Field label="Company" value={response.responder_company ?? '—'} />
                  <Field label="Email" value={response.responder_email ?? '—'} />
                  <Field label="Phone" value={response.responder_phone ?? '—'} />
                  <Field
                    label="Signed at"
                    value={
                      response.signed_at
                        ? new Date(response.signed_at).toLocaleString()
                        : response.date_signed
                          ? new Date(response.date_signed).toLocaleString()
                          : '—'
                    }
                  />
                  <Field label="Signed from IP" value={response.signed_ip ?? '—'} />
                  <Field label="Browser" value={response.signed_user_agent ?? '—'} />
                </Section>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">No response recorded yet.</div>
            )}

            <AuditTrail request={request} events={events} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handlePrint}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold text-sm border-b pb-1 mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{value}</span>
    </div>
  );
}

function fmtBool(v: boolean | null): string {
  if (v === null || v === undefined) return '—';
  return v ? 'Yes' : 'No';
}

const EVENT_LABEL: Record<PEIRequestEvent['event_type'], string> = {
  opened_response_link: 'Opened response link',
  opened_release_link: 'Opened FCRA release',
  submitted: 'Submitted response',
};

function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yn(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v ? 'Yes' : 'No';
}

function row(label: string, value: unknown): string {
  return `<tr><th>${esc(label)}</th><td>${value === undefined || value === null || value === '' ? '—' : esc(value)}</td></tr>`;
}

function buildPrintHtml(args: {
  request: PEIRequest;
  response: PEIResponse | null;
  accidents: PEIAccident[];
  events: PEIRequestEvent[];
  applicantName: string;
}): string {
  const { request, response, accidents, events, applicantName } = args;
  const isGFE = request.status === 'gfe_documented';

  const headerBlock = `
    <header>
      <h1>PEI Record — ${esc(request.employer_name)}</h1>
      <table class="meta">
        ${row('Applicant', applicantName || '—')}
        ${row('Claimed employment', request.employment_start_date ? `${esc(request.employment_start_date)} → ${esc(request.employment_end_date ?? 'present')}` : '—')}
        ${row('Status', request.status)}
      </table>
    </header>`;

  const gfeBlock = isGFE ? `
    <section>
      <h2>Good Faith Effort Documented</h2>
      <table>
        ${row('Reason', request.gfe_reason ? GFE_REASON_LABEL[request.gfe_reason] : '—')}
        ${request.gfe_other_reason ? row('Details', request.gfe_other_reason) : ''}
        ${row('Documented by', request.gfe_signed_by_name ?? '—')}
        ${row('Date', request.date_gfe_created ? new Date(request.date_gfe_created).toLocaleDateString() : '—')}
      </table>
      <p class="note">Per 49 CFR §391.23(c)(2), this record satisfies the good-faith effort requirement.</p>
    </section>` : '';

  const responseBlock = !isGFE && response ? `
    <section>
      <h2>Employment Verification</h2>
      <table>
        ${row('Was employed', yn(response.was_employed))}
        ${row('Dates accurate', yn(response.dates_accurate))}
        ${response.actual_start_date ? row('Actual start', response.actual_start_date) : ''}
        ${response.actual_end_date ? row('Actual end', response.actual_end_date) : ''}
        ${row('Safe & efficient', yn(response.safe_and_efficient))}
        ${row('Reason for leaving', response.reason_for_leaving ?? '—')}
        ${response.reason_detail ? row('Details', response.reason_detail) : ''}
      </table>
    </section>
    <section>
      <h2>Equipment & Trailers</h2>
      <table>
        ${row('Equipment', [
          response.equipment_straight_truck && 'Straight truck',
          response.equipment_tractor_semi && 'Tractor/Semi',
          response.equipment_bus && 'Bus',
        ].filter(Boolean).join(', ') || '—')}
        ${row('Trailers', [
          response.trailer_van && 'Van',
          response.trailer_flatbed && 'Flatbed',
          response.trailer_reefer && 'Reefer',
          response.trailer_cargo_tank && 'Cargo tank',
          response.trailer_triples && 'Triples',
          response.trailer_doubles && 'Doubles',
          response.trailer_na && 'N/A',
        ].filter(Boolean).join(', ') || '—')}
      </table>
    </section>
    <section>
      <h2>Accidents</h2>
      <table>${row('Had accidents', yn(response.had_accidents))}</table>
      ${accidents.length > 0 ? `
        <ul>
          ${accidents.map(a => `<li>${esc(a.accident_date ?? '—')} · ${esc(a.location_city_state ?? '—')} · injuries ${esc(a.number_of_injuries ?? 0)} · fatalities ${esc(a.number_of_fatalities ?? 0)}${a.hazmat_spill ? ' · HazMat' : ''}</li>`).join('')}
        </ul>` : ''}
    </section>
    <section>
      <h2>Drug & Alcohol</h2>
      <table>
        ${row('Violation', yn(response.drug_alcohol_violation))}
        ${response.drug_alcohol_violation ? `
          ${row('Failed SAP rehab', yn(response.failed_rehab))}
          ${row('Post-rehab violations', yn(response.post_rehab_violations))}
          ${response.drug_alcohol_notes ? row('Notes', response.drug_alcohol_notes) : ''}
        ` : ''}
      </table>
    </section>
    <section>
      <h2>Performance Ratings</h2>
      <table>
        ${row('Quality of work', response.rating_quality_of_work ?? '—')}
        ${row('Cooperation', response.rating_cooperation ?? '—')}
        ${row('Safety habits', response.rating_safety_habits ?? '—')}
        ${row('Personal habits', response.rating_personal_habits ?? '—')}
        ${row('Driving skills', response.rating_driving_skills ?? '—')}
        ${row('Attitude', response.rating_attitude ?? '—')}
      </table>
    </section>
    <section>
      <h2>Responder</h2>
      <table>
        ${row('Name', response.responder_name)}
        ${row('Title', response.responder_title ?? '—')}
        ${row('Company', response.responder_company ?? '—')}
        ${row('Email', response.responder_email ?? '—')}
        ${row('Phone', response.responder_phone ?? '—')}
        ${row('Signed at', response.signed_at ? new Date(response.signed_at).toLocaleString() : response.date_signed ? new Date(response.date_signed).toLocaleString() : '—')}
        ${row('Signed from IP', response.signed_ip ?? '—')}
        ${row('Browser', response.signed_user_agent ?? '—')}
      </table>
    </section>` : '';

  const noResponseBlock = !isGFE && !response
    ? `<section><p class="note">No response recorded yet.</p></section>`
    : '';

  // Audit trail (mirrors AuditTrail component logic)
  type Row = { ts: string; label: string; detail?: string };
  const auditRows: Row[] = [];
  if (request.date_sent) auditRows.push({ ts: request.date_sent, label: 'Initial email sent' });
  if (request.date_follow_up_sent) auditRows.push({ ts: request.date_follow_up_sent, label: 'Follow-up email sent' });
  if (request.date_final_notice_sent) auditRows.push({ ts: request.date_final_notice_sent, label: 'Final notice email sent' });
  for (const e of events) {
    const detail = [e.ip_address, e.user_agent].filter(Boolean).join(' · ');
    auditRows.push({ ts: e.occurred_at, label: EVENT_LABEL[e.event_type], detail });
  }
  auditRows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const auditBlock = `
    <section>
      <h2>Audit Trail</h2>
      ${auditRows.length === 0
        ? `<p class="note">No activity recorded yet.</p>`
        : `<table class="audit">
            ${auditRows.map(r => `<tr>
              <td class="ts">${esc(new Date(r.ts).toLocaleString())}</td>
              <td><strong>${esc(r.label)}</strong>${r.detail ? ` — <span class="muted">${esc(r.detail)}</span>` : ''}</td>
            </tr>`).join('')}
          </table>`}
      <p class="note">IP and browser are recorded server-side from request headers when the previous employer interacts with the tokenized links. This trail is retained for FMCSA audit defensibility per 49 CFR §391.53.</p>
    </section>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PEI Record — ${esc(request.employer_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #0D0D0D; margin: 32px; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #C9A84C; }
  header { border-bottom: 2px solid #0D0D0D; padding-bottom: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 4px; }
  th, td { text-align: left; vertical-align: top; padding: 4px 8px; }
  th { width: 180px; font-weight: 600; color: #555; }
  tr + tr th, tr + tr td { border-top: 1px solid #eee; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { margin-bottom: 4px; border-left: 2px solid #C9A84C; padding-left: 6px; list-style: none; }
  .note { font-size: 11px; color: #555; margin-top: 8px; }
  .audit .ts { width: 200px; font-variant-numeric: tabular-nums; color: #555; }
  .muted { color: #555; }
  @media print {
    body { margin: 16mm; }
    section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  ${headerBlock}
  ${gfeBlock}
  ${responseBlock}
  ${noResponseBlock}
  ${auditBlock}
</body>
</html>`;
}

function AuditTrail({
  request,
  events,
}: {
  request: PEIRequest;
  events: PEIRequestEvent[];
}) {
  type Row = { ts: string; label: string; detail?: string };
  const rows: Row[] = [];
  if (request.date_sent) {
    rows.push({
      ts: request.date_sent,
      label: 'Initial email sent',
    });
  }
  if (request.date_follow_up_sent) {
    rows.push({ ts: request.date_follow_up_sent, label: 'Follow-up email sent' });
  }
  if (request.date_final_notice_sent) {
    rows.push({ ts: request.date_final_notice_sent, label: 'Final notice email sent' });
  }
  for (const e of events) {
    const detail = [e.ip_address, e.user_agent].filter(Boolean).join(' · ');
    rows.push({ ts: e.occurred_at, label: EVENT_LABEL[e.event_type], detail });
  }
  rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <section>
      <h3 className="font-semibold text-sm border-b pb-1 mb-2 flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Audit Trail
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[160px_1fr] gap-2">
              <span className="text-muted-foreground tabular-nums">
                {new Date(r.ts).toLocaleString()}
              </span>
              <span>
                <span className="font-medium">{r.label}</span>
                {r.detail && (
                  <span className="text-muted-foreground"> — {r.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
        IP and browser are recorded server-side from request headers when the
        previous employer interacts with the tokenized links. This trail is
        retained for FMCSA audit defensibility per 49 CFR §391.53.
      </p>
    </section>
  );
}