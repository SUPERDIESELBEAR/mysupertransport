import { useState, useEffect, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { supabase } from '@/integrations/supabase/client';
import { Truck, Save, ChevronLeft, ChevronRight, CheckCircle2, Loader2, AlertTriangle, FileText, X } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
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
import { ApplicationFormData, defaultFormData } from '@/components/application/types';

const STEP_LABELS = [
  'Personal Info',
  'CDL Info',
  'Employment',
  'Experience',
  'Accidents',
  'Drug & Alcohol',
  'Documents',
  'Disclosures',
  'Signature',
];

const DRAFT_TOKEN_KEY = 'supertransport_draft_token';

// ─── Validation ────────────────────────────────────────────────────────────
function validateStep(step: number, data: ApplicationFormData): Partial<Record<keyof ApplicationFormData, string>> {
  const errs: Partial<Record<keyof ApplicationFormData, string>> = {};

  if (step === 1) {
    if (!data.first_name.trim()) errs.first_name = 'First name is required';
    if (!data.last_name.trim()) errs.last_name = 'Last name is required';
    if (!data.dob) errs.dob = 'Date of birth is required';
    if (!data.phone.trim()) errs.phone = 'Phone number is required';
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Valid email is required';
    if (!data.address_street.trim()) errs.address_street = 'Street address is required';
    if (!data.address_city.trim()) errs.address_city = 'City is required';
    if (!data.address_state) errs.address_state = 'State is required';
    if (!data.address_zip.trim()) errs.address_zip = 'ZIP code is required';
    if (!data.address_duration) errs.address_duration = 'Please select how long you have lived here';
  }

  if (step === 2) {
    if (!data.cdl_state) errs.cdl_state = 'CDL state is required';
    if (!data.cdl_number.trim()) errs.cdl_number = 'CDL number is required';
    if (!data.cdl_class) errs.cdl_class = 'CDL class is required';
    if (!data.cdl_expiration) errs.cdl_expiration = 'CDL expiration date is required';
    if (!data.endorsements.length) errs.endorsements = 'Please select at least one option (select "None" if no endorsements)' as any;
    if (!data.cdl_10_years) errs.cdl_10_years = 'Please answer this question';
    if (!data.referral_source) errs.referral_source = 'Please tell us how you heard about us';
  }

  if (step === 3) {
    if (!data.employer_1.name.trim()) errs.employer_1 = 'Current/last employer name is required' as any;
    if (!data.has_additional_employers) errs.has_additional_employers = 'Please answer this question';
    if (!data.employment_gaps) errs.employment_gaps = 'Please answer this question';
  }

  if (step === 4) {
    if (!data.years_experience) errs.years_experience = 'Please select your years of experience';
    if (!data.equipment_operated.length) errs.equipment_operated = 'Please select at least one equipment type' as any;
  }

  if (step === 5) {
    if (!data.dot_accidents) errs.dot_accidents = 'Please answer this question';
    if (!data.moving_violations) errs.moving_violations = 'Please answer this question';
  }

  if (step === 6) {
    if (!data.sap_process) errs.sap_process = 'Please answer this question';
  }

  if (step === 7) {
    if (!data.dl_front_url) errs.dl_front_url = 'Front of driver\'s license is required';
    if (!data.dl_rear_url) errs.dl_rear_url = 'Rear of driver\'s license is required';
    if (!data.medical_cert_url) errs.medical_cert_url = 'Medical certificate is required';
  }

  if (step === 8) {
    if (!data.auth_safety_history) errs.auth_safety_history = 'You must authorize this to proceed';
    if (!data.auth_drug_alcohol) errs.auth_drug_alcohol = 'You must authorize this to proceed';
    if (!data.auth_previous_employers) errs.auth_previous_employers = 'You must authorize this to proceed';
    if (!data.dot_positive_test_past_2yr) errs.dot_positive_test_past_2yr = 'Please answer this question';
    if (!data.testing_policy_accepted) errs.testing_policy_accepted = 'You must accept the terms to proceed';
  }

  if (step === 9) {
    if (!data.ssn.trim() || data.ssn.replace(/\D/g, '').length < 9) errs.ssn = 'Valid SSN is required (9 digits)';
    if (!data.typed_full_name.trim()) errs.typed_full_name = 'Please type your full legal name';
    if (!data.signature_image_url) errs.signature_image_url = 'Please draw your signature';
  }

  return errs;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ApplicationForm() {
  const [step, setStep] = useState(1);
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward');
  const [formData, setFormData] = useState<ApplicationFormData>(defaultFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationFormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [duplicateEmailBlocked, setDuplicateEmailBlocked] = useState(false);

  // ── Load draft on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(DRAFT_TOKEN_KEY);
    if (!token) { setDraftLoaded(true); return; }
    supabase
      .from('applications')
      .select('*')
      .eq('draft_token', token)
      .eq('is_draft', true)
      .single()
      .then(({ data }) => {
        if (data) {
          setApplicationId(data.id);
          const restored: ApplicationFormData = {
            ...defaultFormData,
            first_name: data.first_name ?? '',
            last_name: data.last_name ?? '',
            dob: data.dob ?? '',
            phone: data.phone ?? '',
            email: data.email ?? '',
            address_street: data.address_street ?? '',
            address_line2: data.address_line2 ?? '',
            address_city: data.address_city ?? '',
            address_state: data.address_state ?? '',
            address_zip: data.address_zip ?? '',
            address_duration: data.address_duration ?? '',
            prev_address_street: data.prev_address_street ?? '',
            prev_address_line2: data.prev_address_line2 ?? '',
            prev_address_city: data.prev_address_city ?? '',
            prev_address_state: data.prev_address_state ?? '',
            prev_address_zip: data.prev_address_zip ?? '',
            cdl_state: data.cdl_state ?? '',
            cdl_number: data.cdl_number ?? '',
            cdl_class: data.cdl_class ?? '',
            cdl_expiration: data.cdl_expiration ?? '',
            endorsements: (data.endorsements as string[]) ?? [],
            cdl_10_years: data.cdl_10_years === true ? 'yes' : data.cdl_10_years === false ? 'no' : '',
            referral_source: data.referral_source ?? '',
            employer_1: (data.employer_1 as any) ?? defaultFormData.employer_1,
            employer_2: (data.employer_2 as any) ?? defaultFormData.employer_2,
            employer_3: (data.employer_3 as any) ?? defaultFormData.employer_3,
            employer_4: (data.employer_4 as any) ?? defaultFormData.employer_4,
            additional_employers: data.additional_employers ?? '',
            has_additional_employers: '',
            employment_gaps: data.employment_gaps === true ? 'yes' : data.employment_gaps === false ? 'no' : '',
            employment_gaps_explanation: data.employment_gaps_explanation ?? '',
            years_experience: data.years_experience ?? '',
            equipment_operated: (data.equipment_operated as string[]) ?? [],
            dot_accidents: data.dot_accidents === true ? 'yes' : data.dot_accidents === false ? 'no' : '',
            dot_accidents_description: data.dot_accidents_description ?? '',
            moving_violations: data.moving_violations === true ? 'yes' : data.moving_violations === false ? 'no' : '',
            moving_violations_description: data.moving_violations_description ?? '',
            sap_process: data.sap_process === true ? 'yes' : data.sap_process === false ? 'no' : '',
            dl_front_url: data.dl_front_url ?? '',
            dl_rear_url: data.dl_rear_url ?? '',
            medical_cert_url: data.medical_cert_url ?? '',
            auth_safety_history: data.auth_safety_history ?? false,
            auth_drug_alcohol: data.auth_drug_alcohol ?? false,
            auth_previous_employers: data.auth_previous_employers ?? false,
            dot_positive_test_past_2yr: data.dot_positive_test_past_2yr === true ? 'yes' : data.dot_positive_test_past_2yr === false ? 'no' : '',
            dot_return_to_duty_docs: data.dot_return_to_duty_docs === true ? 'yes' : data.dot_return_to_duty_docs === false ? 'no' : '',
            testing_policy_accepted: data.testing_policy_accepted ?? false,
            ssn: '',
            typed_full_name: data.typed_full_name ?? '',
            signature_image_url: data.signature_image_url ?? '',
            signed_date: data.signed_date ?? defaultFormData.signed_date,
          };
          setFormData(restored);
          setShowDraftBanner(true);
        }
        setDraftLoaded(true);
      });
  }, []);

  // ── Field change handler ────────────────────────────────────────────────
  // ── Field change handler ────────────────────────────────────────────────
  const handleChange = useCallback((field: keyof ApplicationFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    // Clear duplicate email block if user edits their email
    if (field === 'email') setDuplicateEmailBlocked(false);
  }, []);

  // ── Start fresh — clear draft, reset form ───────────────────────────────
  const handleStartFresh = () => {
    localStorage.removeItem(DRAFT_TOKEN_KEY);
    setFormData(defaultFormData);
    setApplicationId(null);
    setErrors({});
    setShowDraftBanner(false);
    setStep(1);
  };

  // ── Save draft ──────────────────────────────────────────────────────────
  const saveDraft = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem(DRAFT_TOKEN_KEY) || crypto.randomUUID();
      const payload = buildPayload(formData, token, true);

      if (applicationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('applications') as any).update(payload).eq('id', applicationId);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from('applications') as any).insert(payload).select('id').single();
        if (data) setApplicationId(data.id);
      }
      localStorage.setItem(DRAFT_TOKEN_KEY, token);
    } finally {
      setSaving(false);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem(DRAFT_TOKEN_KEY) || crypto.randomUUID();

      // Encrypt SSN via secure backend function before storing
      let ssnEncrypted: string | null = null;
      if (formData.ssn) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token ?? anonKey;
        const encRes = await fetch(`${supabaseUrl}/functions/v1/encrypt-ssn`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({ ssn: formData.ssn }),
        });
        const encData = await encRes.json();
        ssnEncrypted = encData.encrypted ?? null;
      }

      const payload = { ...buildPayload(formData, token, false, ssnEncrypted), submitted_at: new Date().toISOString() };

      if (applicationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('applications') as any).update(payload).eq('id', applicationId);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('applications') as any).insert(payload);
      }
      localStorage.removeItem(DRAFT_TOKEN_KEY);

      // Fire-and-forget: notify management of new application
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          type: 'new_application',
          applicant_name: `${formData.first_name} ${formData.last_name}`.trim() || formData.email,
          applicant_email: formData.email,
        }),
      }).catch(() => {/* non-critical */});

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step navigation ─────────────────────────────────────────────────────
  const goNext = () => {
    const errs = validateStep(step, formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors({});
    setDuplicateEmailBlocked(false);

    // ── Duplicate email guard (runs async after step 1 validation passes) ──
    if (step === 1) {
      supabase
        .from('applications')
        .select('id')
        .eq('email', formData.email.trim().toLowerCase())
        .eq('is_draft', false)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setDuplicateEmailBlocked(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            setDuplicateEmailBlocked(false);
            setSlideDir('forward');
            setStep(s => s + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      return; // wait for async result
    }

    setSlideDir('forward');
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setErrors({});
    setSlideDir('back');
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isLastStep = step === 9;

  // ── Swipe gesture — MUST be above early returns (Rules of Hooks) ────────
  // Callbacks are no-ops when the form isn't in an interactive state.
  const swipe = useSwipeGesture({
    onSwipeLeft: (!submitted && draftLoaded && !isLastStep) ? goNext : undefined,
    onSwipeRight: (!submitted && draftLoaded && step > 1) ? goBack : undefined,
    excludeSelector: 'canvas, input, textarea, select, button, [role="combobox"]',
  });

  // ── Submitted confirmation ──────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="SUPERTRANSPORT" className="h-24 w-auto" />
          </div>
          <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
            <div className="h-16 w-16 rounded-full bg-status-complete/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-status-complete" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Application Submitted!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thank you for applying to drive with SUPERTRANSPORT LLC. Your application has been received and will be reviewed within <strong>1–3 business days</strong>. You'll receive an email notification once a decision has been made.
            </p>
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Questions?{' '}
                <a href="mailto:recruiting@mysupertransport.com" className="text-gold hover:underline">
                  recruiting@mysupertransport.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!draftLoaded) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <header className="bg-surface-dark border-b border-surface-dark-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <img src={logo} alt="SUPERTRANSPORT" className="h-10 w-auto" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium text-surface-dark-muted hover:text-gold transition-colors px-3 py-2 rounded-lg hover:bg-surface-dark-card"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Progress
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-28 md:pb-8">
        {/* FMCSA Notice */}
        {step === 1 && (
          <div className="mb-6 p-4 border border-border rounded-xl bg-white">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">FMCSA Notice:</strong> This application is required under regulations enforced by the Federal Motor Carrier Safety Administration (FMCSA). Please provide information that is true and accurate to the best of your knowledge. If exact details are unavailable, approximate dates and locations are acceptable. The motor carrier will conduct all required background and safety investigations separately.
            </p>
          </div>
        )}

        {/* Progress */}
        <FormProgress currentStep={step} totalSteps={9} stepLabels={STEP_LABELS} />

        {/* Duplicate email warning */}
        {duplicateEmailBlocked && (
          <div className="mb-5 flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Application already submitted</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                An application has already been submitted for <strong>{formData.email}</strong>. If you believe this is an error or need to reapply, please contact us at{' '}
                <a href="mailto:recruiting@mysupertransport.com" className="underline font-medium">
                    recruiting@mysupertransport.com
                  </a>.
              </p>
            </div>
          </div>
        )}

        {/* Error summary */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-5 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive font-medium">
            Please fix the highlighted fields before continuing.
          </div>
        )}

        {/* Step content — swipeable on mobile */}
        <div
          ref={swipe.ref}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          className="overflow-hidden rounded-2xl shadow-sm"
        >
          <div
            key={step}
            className={`bg-white border border-border rounded-2xl p-6 select-none ${
              slideDir === 'forward' ? 'animate-slide-in-right' : 'animate-slide-in-left'
            }`}
          >
            {step === 1 && <Step1Personal data={formData} onChange={handleChange} errors={errors} />}
            {step === 2 && <Step2CDL data={formData} onChange={handleChange} errors={errors} />}
            {step === 3 && <Step3Employment data={formData} onChange={handleChange} errors={errors} />}
            {step === 4 && <Step4Driving data={formData} onChange={handleChange} errors={errors} />}
            {step === 5 && <Step5Accidents data={formData} onChange={handleChange} errors={errors} />}
            {step === 6 && <Step6DrugAlcohol data={formData} onChange={handleChange} errors={errors} />}
            {step === 7 && <Step7Documents data={formData} onChange={handleChange} errors={errors} />}
            {step === 8 && <Step8Disclosures data={formData} onChange={handleChange} errors={errors} />}
            {step === 9 && <Step9Signature data={formData} onChange={handleChange} errors={errors} />}
          </div>
        </div>

        {/* Swipe hint — mobile only, fades after first step */}
        {step === 1 && (
          <p className="md:hidden text-center text-xs text-muted-foreground mt-3 opacity-60">
            Swipe left to advance · Swipe right to go back
          </p>
        )}

        {/* Navigation — desktop only */}
        <div className="hidden md:flex items-center justify-between mt-6 gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold text-surface-dark text-sm font-bold hover:bg-gold-light transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit Application
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold text-surface-dark text-sm font-bold hover:bg-gold-light transition-colors"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Return to draft hint */}
        {step === 1 && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Returning to complete your application?{' '}
            <button onClick={saveDraft} className="text-gold hover:underline">Your progress auto-saves</button>
            {' '}when you use "Save Progress."
          </p>
        )}
      </div>

      {/* ── Mobile sticky bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-dark border-t border-surface-dark-border">
        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pt-2.5 pb-1">
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i + 1 === step
                  ? 'w-5 h-1.5 bg-gold'
                  : i + 1 < step
                  ? 'w-1.5 h-1.5 bg-gold/50'
                  : 'w-1.5 h-1.5 bg-surface-dark-border'
              }`}
            />
          ))}
        </div>
        {/* Step label */}
        <p className="text-center text-[10px] font-medium text-surface-dark-muted mb-1.5">
          Step {step} of 9 — {STEP_LABELS[step - 1]}
        </p>
        {/* Action row */}
        <div className="flex items-center gap-2 px-4 pb-safe pb-3">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border border-surface-dark-border text-sm font-medium text-surface-dark-muted hover:text-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={saveDraft}
            disabled={saving}
            className="flex items-center justify-center h-11 w-11 rounded-xl border border-surface-dark-border text-surface-dark-muted hover:text-gold transition-colors shrink-0"
            title="Save draft"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-gold text-surface-dark text-sm font-bold hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-gold text-surface-dark text-sm font-bold hover:bg-gold-light transition-colors"
            >
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

// ─── Payload builder ──────────────────────────────────────────────────────
function buildPayload(data: ApplicationFormData, token: string, isDraft: boolean, ssnEncrypted?: string | null): Record<string, unknown> {
  return {
    draft_token: token,
    is_draft: isDraft,
    email: data.email,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    dob: data.dob || null,
    phone: data.phone || null,
    address_street: data.address_street || null,
    address_line2: data.address_line2 || null,
    address_city: data.address_city || null,
    address_state: data.address_state || null,
    address_zip: data.address_zip || null,
    address_duration: data.address_duration || null,
    prev_address_street: data.prev_address_street || null,
    prev_address_line2: data.prev_address_line2 || null,
    prev_address_city: data.prev_address_city || null,
    prev_address_state: data.prev_address_state || null,
    prev_address_zip: data.prev_address_zip || null,
    cdl_state: data.cdl_state || null,
    cdl_number: data.cdl_number || null,
    cdl_class: data.cdl_class || null,
    cdl_expiration: data.cdl_expiration || null,
    endorsements: data.endorsements.length ? data.endorsements : null,
    cdl_10_years: data.cdl_10_years === 'yes' ? true : data.cdl_10_years === 'no' ? false : null,
    referral_source: data.referral_source || null,
    employer_1: data.employer_1 as unknown as Record<string, unknown>,
    employer_2: data.employer_2 as unknown as Record<string, unknown>,
    employer_3: data.employer_3 as unknown as Record<string, unknown>,
    employer_4: data.employer_4 as unknown as Record<string, unknown>,
    additional_employers: data.additional_employers || null,
    employment_gaps: data.employment_gaps === 'yes' ? true : data.employment_gaps === 'no' ? false : null,
    employment_gaps_explanation: data.employment_gaps_explanation || null,
    years_experience: data.years_experience || null,
    equipment_operated: data.equipment_operated.length ? data.equipment_operated : null,
    dot_accidents: data.dot_accidents === 'yes' ? true : data.dot_accidents === 'no' ? false : null,
    dot_accidents_description: data.dot_accidents_description || null,
    moving_violations: data.moving_violations === 'yes' ? true : data.moving_violations === 'no' ? false : null,
    moving_violations_description: data.moving_violations_description || null,
    sap_process: data.sap_process === 'yes' ? true : data.sap_process === 'no' ? false : null,
    dl_front_url: data.dl_front_url || null,
    dl_rear_url: data.dl_rear_url || null,
    medical_cert_url: data.medical_cert_url || null,
    auth_safety_history: data.auth_safety_history,
    auth_drug_alcohol: data.auth_drug_alcohol,
    auth_previous_employers: data.auth_previous_employers,
    dot_positive_test_past_2yr: data.dot_positive_test_past_2yr === 'yes' ? true : data.dot_positive_test_past_2yr === 'no' ? false : null,
    dot_return_to_duty_docs: data.dot_return_to_duty_docs === 'yes' ? true : data.dot_return_to_duty_docs === 'no' ? false : null,
    testing_policy_accepted: data.testing_policy_accepted,
    // SSN is encrypted server-side via AES-256-GCM; never stored as plaintext
    ssn_encrypted: ssnEncrypted ?? null,
    typed_full_name: data.typed_full_name || null,
    signature_image_url: data.signature_image_url || null,
    signed_date: data.signed_date || null,
  };
}
