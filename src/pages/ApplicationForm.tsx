import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { supabase } from '@/integrations/supabase/client';
import { Truck, Save, ChevronLeft, ChevronRight, CheckCircle2, Loader2, AlertTriangle, FileText, X, Link2Off } from 'lucide-react';
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

import { validateStep, buildPayload } from '@/components/application/utils';

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
      .rpc('get_application_by_draft_token', { p_token: token })
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
            employers: Array.isArray(data.employers) && (data.employers as any[]).length > 0
              ? (data.employers as any[]).map((e: any) => ({ ...defaultFormData.employers[0], ...e }))
              : [{ ...defaultFormData.employers[0] }],
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
            <img src={logo} alt="SUPERTRANSPORT" className="h-28 w-auto max-w-[400px] object-contain" />
          </div>
          <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
            <div className="h-16 w-16 rounded-full bg-status-complete/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-status-complete" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Application Submitted!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thank you for applying to drive with SUPERTRANSPORT. Your application has been received and will be reviewed within <strong>1–3 business days</strong>. You'll receive an email notification once a decision has been made.
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
          <img src={logo} alt="SUPERTRANSPORT" className="h-10 w-auto max-w-[180px] object-contain shrink-0" />
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
        {/* Draft recovery banner */}
        {showDraftBanner && (
          <div className="mb-5 flex items-start gap-3 p-4 bg-gold/10 border border-gold/40 rounded-xl animate-fade-in">
            <FileText className="h-5 w-5 text-gold shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Your previous progress has been restored</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                We found a saved draft and picked up where you left off. You can continue or start over.
              </p>
              <button
                type="button"
                onClick={handleStartFresh}
                className="mt-2 text-xs font-medium text-gold hover:text-gold/80 underline underline-offset-2 transition-colors"
              >
                Start fresh instead →
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowDraftBanner(false)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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
          <div className="mb-5 flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Application already submitted</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                An application has already been submitted for <strong>{formData.email}</strong>. If you believe this is an error or need to reapply, please contact us at{' '}
                <a href="mailto:recruiting@mysupertransport.com" className="underline font-medium text-gold">
                    recruiting@mysupertransport.com
                  </a>.
              </p>
            </div>
          </div>
        )}

        {/* Error summary */}

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

