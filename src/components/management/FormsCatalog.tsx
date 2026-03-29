import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Eye, FileText, ClipboardList, ScrollText, ShieldCheck, Users, FlaskConical, Award } from 'lucide-react';
import FormProgress from '@/components/application/FormProgress';
import Step1Personal from '@/components/application/Step1Personal';
import Step2CDL from '@/components/application/Step2CDL';
import Step3Employment from '@/components/application/Step3Employment';
import Step4Driving from '@/components/application/Step4Driving';
import Step5Accidents from '@/components/application/Step5Accidents';
import Step6DrugAlcohol from '@/components/application/Step6DrugAlcohol';
import Step7Documents from '@/components/application/Step7Documents';
import Step8Disclosures from '@/components/application/Step8Disclosures';
import Step9Signature from '@/components/application/Step9Signature';
import { defaultFormData } from '@/components/application/types';
import ICADocumentView from '@/components/ica/ICADocumentView';
import FCRAAuthorizationDoc from '@/components/application/documents/FCRAAuthorizationDoc';
import PreEmploymentAuthorizationsDoc from '@/components/application/documents/PreEmploymentAuthorizationsDoc';
import DOTDrugAlcoholQuestionsDoc from '@/components/application/documents/DOTDrugAlcoholQuestionsDoc';
import CompanyTestingPolicyCertDoc from '@/components/application/documents/CompanyTestingPolicyCertDoc';
import type { FullApplication } from '@/components/management/ApplicationReviewDrawer';

const STEP_LABELS = [
  'Personal Info', 'CDL Info', 'Employment', 'Experience',
  'Accidents', 'Drug & Alcohol', 'Documents', 'Disclosures', 'Signature',
];

// ─── Sample data for multi-step app preview ──────────────────────────────────
const SAMPLE_DATA = {
  ...defaultFormData,
  first_name: 'John', last_name: 'Smith', dob: '1985-06-15',
  phone: '816-555-0100', email: 'john.smith@example.com',
  address_street: '1234 Highway 70 W', address_city: 'Kansas City',
  address_state: 'MO', address_zip: '64111', address_duration: '3_or_more',
  cdl_state: 'MO', cdl_number: 'F123456789', cdl_class: 'CDL-A',
  cdl_expiration: '2027-03-01', endorsements: ['H', 'N'], cdl_10_years: 'yes',
  referral_source: 'referral', years_experience: '8_10',
  equipment_operated: ['dry_van', 'temp_controlled'],
  dot_accidents: 'no', moving_violations: 'no', sap_process: 'no',
  dl_front_url: 'https://placehold.co/400x250?text=DL+Front',
  dl_rear_url: 'https://placehold.co/400x250?text=DL+Rear',
  medical_cert_url: 'https://placehold.co/400x250?text=Med+Cert',
  auth_safety_history: true, auth_drug_alcohol: true, auth_previous_employers: true,
  dot_positive_test_past_2yr: 'no', testing_policy_accepted: true,
  typed_full_name: 'John Smith', signed_date: 'March 25, 2026',
  employers: [{ name: 'ABC Trucking Co.', city: 'St. Louis', state: 'MO', position: 'OTR Driver', reason_leaving: 'Better opportunity', cmv_position: 'yes', start_date: '01/2019', end_date: '06/2024' }],
  employment_gaps: 'no',
};

// ─── Blank applicant — used for clean standalone doc previews ─────────────────
const BLANK_APP: FullApplication = {
  id: 'preview',
  first_name: null, last_name: null, email: '',
  phone: null, dob: null,
  address_street: null, address_city: null, address_state: null,
  address_zip: null, address_duration: null,
  prev_address_street: null, prev_address_city: null, prev_address_state: null, prev_address_zip: null,
  cdl_number: null, cdl_state: null, cdl_class: null, cdl_expiration: null, cdl_10_years: null,
  endorsements: null, equipment_operated: null, years_experience: null, referral_source: null,
  employer_1: null, employer_2: null, employer_3: null, employer_4: null,
  employment_gaps: null, employment_gaps_explanation: null, additional_employers: null,
  dot_accidents: null, dot_accidents_description: null,
  moving_violations: null, moving_violations_description: null,
  dot_positive_test_past_2yr: null, dot_return_to_duty_docs: null, sap_process: null,
  auth_safety_history: null, auth_drug_alcohol: null, auth_previous_employers: null,
  testing_policy_accepted: null,
  typed_full_name: null, signed_date: null,
  review_status: 'pending', submitted_at: null, reviewer_notes: null,
  dl_front_url: null, dl_rear_url: null, medical_cert_url: null,
  medical_cert_expiration: null, signature_image_url: null,
};

// ─── No-op onChange ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (_field: any, _value: any) => {};

// ─── Form catalog entry ───────────────────────────────────────────────────────
interface FormEntry {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
  steps: number;
  icon: React.ReactNode;
  category: 'application' | 'ica' | 'standalone-doc';
}

// ─── Sample ICA data ──────────────────────────────────────────────────────────
const ICA_SAMPLE_DATA = {
  truck_year: '2021', truck_make: 'Freightliner', truck_model: 'Cascadia',
  truck_vin: '3AKJHHDR7MSXYZ123', truck_plate: 'AB1234', truck_plate_state: 'MO',
  trailer_number: '', owner_name: 'John Smith', owner_business_name: 'Smith Transport LLC',
  owner_ein: '12-3456789', owner_ssn: '', owner_address: '1234 Highway 70 W',
  owner_city: 'Kansas City', owner_state: 'MO', owner_zip: '64111',
  owner_phone: '816-555-0100', owner_email: 'john.smith@example.com',
  linehaul_split_pct: 72, lease_effective_date: '2026-04-01', lease_termination_date: '',
};

const FORMS: FormEntry[] = [
  {
    id: 'driver-application',
    title: 'Driver Application',
    description: 'FMCSA-compliant multi-step application form covering personal info, CDL, employment history, driving experience, accident record, drug & alcohol status, documents, disclosures, and e-signature.',
    badge: '9 Steps',
    badgeVariant: 'secondary',
    steps: 9,
    icon: <ClipboardList className="h-5 w-5 text-primary" />,
    category: 'application',
  },
  {
    id: 'ica-contract',
    title: 'Independent Contractor Agreement',
    description: 'Full ICA document with all standard clauses (compensation, insurance, equipment lease, termination) plus Appendices A–D with equipment identification, pay schedule, and drug & alcohol policy.',
    badge: 'Single View',
    badgeVariant: 'outline',
    steps: 1,
    icon: <ScrollText className="h-5 w-5 text-primary" />,
    category: 'ica',
  },
  {
    id: 'fcra-authorization',
    title: 'FCRA Authorization',
    description: 'Fair Credit Reporting Act disclosure and background investigation authorization. Implicit acceptance via applicant signature.',
    badge: 'Standalone Doc',
    badgeVariant: 'outline',
    steps: 1,
    icon: <ShieldCheck className="h-5 w-5 text-primary" />,
    category: 'standalone-doc',
  },
  {
    id: 'pre-employment-authorizations',
    title: 'PSP Authorization',
    description: 'FMCSA Pre-Employment Screening Program (PSP) disclosure and authorization form, including crash data and inspection history release.',
    badge: 'Standalone Doc',
    badgeVariant: 'outline',
    steps: 1,
    icon: <Users className="h-5 w-5 text-primary" />,
    category: 'standalone-doc',
  },
  {
    id: 'dot-drug-alcohol-questions',
    title: 'DOT Drug & Alcohol Questions',
    description: 'Mandatory pre-employment disclosure questions per 49 CFR § 40.25(j) regarding positive tests, refusals, and return-to-duty documentation.',
    badge: 'Standalone Doc',
    badgeVariant: 'outline',
    steps: 1,
    icon: <FlaskConical className="h-5 w-5 text-primary" />,
    category: 'standalone-doc',
  },
  {
    id: 'company-testing-policy-cert',
    title: 'Certificate of Receipt — Testing Policy',
    description: 'Applicant certification of receipt and understanding of the company drug & alcohol testing policy per 49 CFR § 382.601, including full application truthfulness certification.',
    badge: 'Standalone Doc',
    badgeVariant: 'outline',
    steps: 1,
    icon: <Award className="h-5 w-5 text-primary" />,
    category: 'standalone-doc',
  },
];

// ─── Step renderer (read-only) ────────────────────────────────────────────────
function PreviewStep({ step }: { step: number }) {
  return (
    <div className="relative pointer-events-none select-none">
      {step === 1 && <Step1Personal data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 2 && <Step2CDL data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 3 && <Step3Employment data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 4 && <Step4Driving data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 5 && <Step5Accidents data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 6 && <Step6DrugAlcohol data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 7 && <Step7Documents data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 8 && <Step8Disclosures data={SAMPLE_DATA} onChange={noop} errors={{}} />}
      {step === 9 && <Step9Signature data={SAMPLE_DATA} onChange={noop} errors={{}} />}
    </div>
  );
}

// ─── Standalone document renderer ────────────────────────────────────────────
function StandaloneDocPreview({ formId }: { formId: string }) {
  return (
    <div className="pointer-events-none select-none overflow-auto">
      <div style={{ transform: 'scale(0.72)', transformOrigin: 'top center', width: '138.8%', marginLeft: '-19.4%' }}>
        {formId === 'fcra-authorization' && <FCRAAuthorizationDoc app={BLANK_APP} />}
        {formId === 'pre-employment-authorizations' && <PreEmploymentAuthorizationsDoc app={BLANK_APP} />}
        {formId === 'dot-drug-alcohol-questions' && <DOTDrugAlcoholQuestionsDoc app={BLANK_APP} />}
        {formId === 'company-testing-policy-cert' && <CompanyTestingPolicyCertDoc app={BLANK_APP} />}
      </div>
    </div>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────
function FormPreviewModal({ form, onClose }: { form: FormEntry; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const totalSteps = form.steps;
  const isICA = form.id === 'ica-contract';
  const isStandaloneDoc = form.category === 'standalone-doc';

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {form.icon}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-tight truncate">{form.title}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isStandaloneDoc ? 'Blank form preview · Step 8 standalone document' : `Read-only preview${!isICA ? ` · ${totalSteps} steps` : ''}`}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              Preview Only
            </Badge>
          </div>
        </DialogHeader>

        {/* Progress bar — application only */}
        {!isICA && !isStandaloneDoc && (
          <div className="shrink-0 px-6 pt-4 pb-2">
            <FormProgress currentStep={step} totalSteps={totalSteps} stepLabels={STEP_LABELS} />
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isICA ? (
            <div className="pointer-events-none select-none">
              <ICADocumentView
                data={ICA_SAMPLE_DATA}
                operatorName="John Smith"
                previewMode
                carrierTypedName="Sarah Johnson"
                carrierTitle="Operations Manager"
                carrierSignedAt="2026-04-01"
                contractorTypedName="John Smith"
                contractorSignedAt="2026-04-01"
              />
            </div>
          ) : isStandaloneDoc ? (
            <StandaloneDocPreview formId={form.id} />
          ) : (
            <PreviewStep step={step} />
          )}
        </div>

        {/* Navigation footer — application only */}
        {!isICA && !isStandaloneDoc && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-secondary/40">
            <Button variant="outline" size="sm" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              Step {step} of {totalSteps} — {STEP_LABELS[step - 1]}
            </span>
            <Button variant="outline" size="sm" onClick={() => setStep(s => Math.min(totalSteps, s + 1))} disabled={step === totalSteps} className="gap-1.5">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FormsCatalog() {
  const [previewForm, setPreviewForm] = useState<FormEntry | null>(null);

  const appForms = FORMS.filter(f => f.category !== 'standalone-doc');
  const standaloneDocs = FORMS.filter(f => f.category === 'standalone-doc');

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Forms Catalog</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse and preview all operational forms. Click a form to page through its sections with sample data.
        </p>
      </div>

      {/* Application & ICA forms */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Application & Contracts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {appForms.map(form => (
            <FormCard key={form.id} form={form} onPreview={() => setPreviewForm(form)} />
          ))}
        </div>
      </div>

      {/* Standalone disclosure documents */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Step 8 — Standalone Disclosure Documents</h2>
        <p className="text-xs text-muted-foreground -mt-1">These documents are completed within Step 8 of the application and available for individual PDF download from the applicant review drawer.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {standaloneDocs.map(form => (
            <FormCard key={form.id} form={form} onPreview={() => setPreviewForm(form)} />
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {previewForm && (
        <FormPreviewModal form={previewForm} onClose={() => setPreviewForm(null)} />
      )}
    </div>
  );
}

// ─── Reusable form card ───────────────────────────────────────────────────────
function FormCard({ form, onPreview }: { form: FormEntry; onPreview: () => void }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {form.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground leading-tight">{form.title}</h2>
            <Badge variant={form.badgeVariant} className="text-[10px] px-1.5 py-0">{form.badge}</Badge>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{form.description}</p>
      <Button size="sm" variant="outline" className="w-full gap-2 text-xs" onClick={onPreview}>
        <Eye className="h-3.5 w-3.5" /> Preview Form
      </Button>
    </div>
  );
}

