import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Printer, FileText, Loader2, ChevronDown } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { preloadSignatureDataUrl, printDocumentById } from '@/lib/printDocument';

interface EmployerRecord {
  name?: string;
  city?: string;
  state?: string;
  position?: string;
  reason_leaving?: string;
  cmv_position?: string;
  start_date?: string;
  end_date?: string;
  email?: string;
}

interface ApplicationSnapshot {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_duration?: string | null;
  prev_address_street?: string | null;
  prev_address_line2?: string | null;
  prev_address_city?: string | null;
  prev_address_state?: string | null;
  prev_address_zip?: string | null;
  cdl_state?: string | null;
  cdl_number?: string | null;
  cdl_class?: string | null;
  cdl_expiration?: string | null;
  endorsements?: string[] | null;
  cdl_10_years?: string | null;
  referral_source?: string | null;
  employers?: EmployerRecord[] | null | unknown;
  employment_gaps?: string | null;
  employment_gaps_explanation?: string | null;
  years_experience?: string | null;
  equipment_operated?: string[] | null;
  dot_accidents?: string | null;
  dot_accidents_description?: string | null;
  moving_violations?: string | null;
  moving_violations_description?: string | null;
  sap_process?: string | null;
  dot_positive_test_past_2yr?: string | null;
  dot_return_to_duty_docs?: string | null;
  auth_safety_history?: boolean | null;
  auth_drug_alcohol?: boolean | null;
  auth_previous_employers?: boolean | null;
  testing_policy_accepted?: boolean | null;
  medical_cert_expiration?: string | null;
  dl_front_url?: string | null;
  dl_rear_url?: string | null;
  medical_cert_url?: string | null;
  typed_full_name?: string | null;
  signature_image_url?: string | null;
  signed_date?: string | null;
  submitted_at?: string | null;
  submitted_by_staff?: boolean | null;
}

interface Props {
  application: ApplicationSnapshot | null;
  onPreview: (url: string, name: string) => void;
}

const dash = <span className="text-muted-foreground italic">—</span>;

function val(v: string | null | undefined) {
  if (v === null || v === undefined || v === '') return dash;
  return <span className="text-foreground">{v}</span>;
}

function yn(v: string | null | undefined) {
  if (!v) return dash;
  if (v === 'yes') return <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>;
  if (v === 'no') return <Badge variant="outline" className="border-green-300 text-green-700">No</Badge>;
  return <span className="text-foreground">{v}</span>;
}

function bool(v: boolean | null | undefined) {
  if (v === true) return <Badge variant="outline" className="border-green-300 text-green-700">Acknowledged</Badge>;
  if (v === false) return <Badge variant="outline" className="border-muted text-muted-foreground">Not acknowledged</Badge>;
  return dash;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return dash;
  // YYYY-MM-DD → noon local to avoid tz drift
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
    if (isNaN(d.getTime())) return <span className="text-foreground">{s}</span>;
    return <span className="text-foreground">{d.toLocaleDateString('en-US')}</span>;
  } catch {
    return <span className="text-foreground">{s}</span>;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-gold" />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="pl-3 border-l border-border space-y-3">{children}</div>
    </div>
  );
}

export default function SubmittedApplicationSnapshot({ application, onPreview }: Props) {
  const { toast } = useToast();
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raw = application?.signature_image_url ?? null;
    setSignatureDataUrl(null);
    if (!raw) return;
    preloadSignatureDataUrl(raw, 'signatures').then((dataUrl) => {
      if (!cancelled) setSignatureDataUrl(dataUrl);
    });
    return () => { cancelled = true; };
  }, [application?.signature_image_url]);

  if (!application || !application.id) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Submitted Application</h3>
        </div>
        <p className="text-xs text-muted-foreground italic">
          No original application on file — this driver was added directly.
        </p>
      </div>
    );
  }

  const a = application;
  const employers: EmployerRecord[] = Array.isArray(a.employers) ? (a.employers as EmployerRecord[]) : [];
  const endorsements = Array.isArray(a.endorsements) ? a.endorsements : [];
  const equipment = Array.isArray(a.equipment_operated) ? a.equipment_operated : [];

  async function openAppDoc(path: string | null | undefined, name: string) {
    if (!path) return;
    setLoadingDoc(path);
    try {
      // Normalize: if already a fully-qualified URL, hand it through.
      if (/^https?:\/\//i.test(path)) {
        onPreview(path, name);
        return;
      }
      const { data, error } = await supabase.storage
        .from('application-documents')
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw error ?? new Error('No signed URL');
      onPreview(data.signedUrl, name);
    } catch (err) {
      toast({ title: 'Could not open document', description: (err as Error)?.message, variant: 'destructive' });
    } finally {
      setLoadingDoc(null);
    }
  }

  const docButton = (path: string | null | undefined, label: string) => {
    if (!path) return dash;
    const busy = loadingDoc === path;
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        onClick={() => openAppDoc(path, label)}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        View
      </Button>
    );
  };

  const handlePrint = () => {
    const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
    printDocumentById('submitted-application-print-content', `Application — ${fullName}`);
  };

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
          aria-expanded={expanded}
        >
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Submitted Application</h3>
          {a.submitted_by_staff && (
            <Badge variant="outline" className="border-gold/40 text-foreground text-[10px]">Staff-assisted</Badge>
          )}
        </button>
        {expanded && (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print application
          </Button>
        )}
      </div>

      {expanded && (<div id="submitted-application-print-content" className="space-y-5">
      <Section title="Personal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">{val(`${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || undefined)}</Field>
          <Field label="Email">{val(a.email)}</Field>
          <Field label="Phone">{val(formatPhoneDisplay(a.phone ?? '') || a.phone || undefined)}</Field>
          <Field label="Date of birth">{fmtDate(a.dob)}</Field>
          <Field label="Current address">
            {val([a.address_street, a.address_line2, a.address_city, a.address_state, a.address_zip].filter(Boolean).join(', ') || undefined)}
          </Field>
          <Field label="Duration at address">{val(a.address_duration)}</Field>
          <Field label="Previous address">
            {val([a.prev_address_street, a.prev_address_line2, a.prev_address_city, a.prev_address_state, a.prev_address_zip].filter(Boolean).join(', ') || undefined)}
          </Field>
        </div>
      </Section>

      <Section title="CDL">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="State">{val(a.cdl_state)}</Field>
          <Field label="Number">{val(a.cdl_number)}</Field>
          <Field label="Class">{val(a.cdl_class)}</Field>
          <Field label="Expiration">{fmtDate(a.cdl_expiration)}</Field>
          <Field label="Endorsements">{endorsements.length ? <span className="text-foreground">{endorsements.join(', ')}</span> : dash}</Field>
          <Field label="Held CDL 10+ years">{yn(a.cdl_10_years)}</Field>
          <Field label="Referral source">{val(a.referral_source)}</Field>
        </div>
      </Section>

      <Section title={`Employment history (${employers.length})`}>
        {employers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No employers listed.</p>
        ) : (
          <div className="space-y-3">
            {employers.map((e, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={`Employer ${i + 1}`}>{val(e.name)}</Field>
                <Field label="Location">{val([e.city, e.state].filter(Boolean).join(', ') || undefined)}</Field>
                <Field label="Position">{val(e.position)}</Field>
                <Field label="Dates">{val([e.start_date, e.end_date].filter(Boolean).join(' – ') || undefined)}</Field>
                <Field label="CMV position">{yn(e.cmv_position)}</Field>
                <Field label="Contact email">{val(e.email)}</Field>
                <div className="sm:col-span-2">
                  <Field label="Reason for leaving">{val(e.reason_leaving)}</Field>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Field label="Employment gaps">{yn(a.employment_gaps)}</Field>
          <Field label="Gap explanation">{val(a.employment_gaps_explanation)}</Field>
        </div>
      </Section>

      <Section title="Driving experience">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Years">{val(a.years_experience)}</Field>
          <Field label="Equipment operated">{equipment.length ? <span className="text-foreground">{equipment.join(', ')}</span> : dash}</Field>
        </div>
      </Section>

      <Section title="Accidents & violations">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="DOT accidents">{yn(a.dot_accidents)}</Field>
          <Field label="Moving violations">{yn(a.moving_violations)}</Field>
          <div className="sm:col-span-2"><Field label="Accident details">{val(a.dot_accidents_description)}</Field></div>
          <div className="sm:col-span-2"><Field label="Violation details">{val(a.moving_violations_description)}</Field></div>
        </div>
      </Section>

      <Section title="Drug & alcohol">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="In SAP process">{yn(a.sap_process)}</Field>
          <Field label="Positive test (past 2 yr)">{yn(a.dot_positive_test_past_2yr)}</Field>
          <Field label="Return-to-duty docs">{yn(a.dot_return_to_duty_docs)}</Field>
        </div>
      </Section>

      <Section title="Documents">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Driver's license (front)">{docButton(a.dl_front_url, "Driver's License — Front")}</Field>
          <Field label="Driver's license (rear)">{docButton(a.dl_rear_url, "Driver's License — Rear")}</Field>
          <Field label="Medical certificate">{docButton(a.medical_cert_url, 'Medical Certificate')}</Field>
          <Field label="Medical cert expiration">{fmtDate(a.medical_cert_expiration)}</Field>
        </div>
      </Section>

      <Section title="Disclosures">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Safety history">{bool(a.auth_safety_history)}</Field>
          <Field label="Drug & alcohol">{bool(a.auth_drug_alcohol)}</Field>
          <Field label="Previous employers">{bool(a.auth_previous_employers)}</Field>
          <Field label="Testing policy">{bool(a.testing_policy_accepted)}</Field>
        </div>
      </Section>

      <Section title="Signature">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Typed full name">{val(a.typed_full_name)}</Field>
          <Field label="Signed date">{fmtDate(a.signed_date)}</Field>
          <Field label="Submitted at">{a.submitted_at ? <span className="text-foreground">{new Date(a.submitted_at).toLocaleString('en-US')}</span> : dash}</Field>
          <Field label="Source">{a.submitted_by_staff ? <span className="text-foreground">Staff-assisted</span> : <span className="text-foreground">Driver self-submitted</span>}</Field>
        </div>
        {a.signature_image_url && (
          <div className="pt-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Signature image</div>
            {signatureDataUrl ? (
              <img
                src={signatureDataUrl}
                alt="Applicant signature"
                className="max-h-24 border border-border rounded-md bg-white p-1"
              />
            ) : (
              <div className="h-24 w-48 border border-border rounded-md bg-muted/30 flex items-center justify-center text-[11px] text-muted-foreground">
                Loading signature…
              </div>
            )}
          </div>
        )}
      </Section>
      </div>)}
    </div>
  );
}