import { useEffect, useState } from 'react';
import { Loader2, Printer, ShieldCheck, FileWarning, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchPEIResponse, fetchPEIAccidents, fetchPEIRequestEvents } from '@/lib/pei/api';
import { GFE_REASON_LABEL, type PEIRequest, type PEIResponse, type PEIAccident, type PEIRequestEvent } from '@/lib/pei/types';
import { supabase } from '@/integrations/supabase/client';

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
                  <Field label="Submitted" value={response.date_signed ? new Date(response.date_signed).toLocaleString() : '—'} />
                </Section>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">No response recorded yet.</div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
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