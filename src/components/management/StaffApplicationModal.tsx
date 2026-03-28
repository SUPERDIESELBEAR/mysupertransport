import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
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
import { validateStep, buildPayload } from '@/components/application/utils';
import { useToast } from '@/hooks/use-toast';

const STEP_LABELS = [
  'Personal Info', 'CDL Info', 'Employment', 'Experience',
  'Accidents', 'Drug & Alcohol', 'Documents', 'Disclosures', 'Signature',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StaffApplicationModal({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ApplicationFormData>({ ...defaultFormData });
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback((field: keyof ApplicationFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  const goNext = () => {
    const errs = validateStep(step, formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(s => s + 1);
  };

  const goBack = () => {
    setErrors({});
    setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    const errs = validateStep(9, formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const token = crypto.randomUUID();

      // Encrypt SSN
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

      const payload = {
        ...buildPayload(formData, token, false, ssnEncrypted),
        submitted_at: new Date().toISOString(),
        submitted_by_staff: true,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('applications') as any).insert(payload);
      if (error) throw error;

      // Audit log
      const { data: { session: sess } } = await supabase.auth.getSession();
      const userId = sess?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', userId)
          .single();
        const actorName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') : 'Staff';
        await supabase.from('audit_log').insert({
          actor_id: userId,
          actor_name: actorName,
          action: 'staff_submitted_application',
          entity_type: 'application',
          entity_label: `${formData.first_name} ${formData.last_name}`.trim() || formData.email,
          metadata: { email: formData.email },
        });
      }

      // Fire-and-forget notification
      const supabaseUrl2 = import.meta.env.VITE_SUPABASE_URL;
      const anonKey2 = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      fetch(`${supabaseUrl2}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey2}`,
          'apikey': anonKey2,
        },
        body: JSON.stringify({
          type: 'new_application',
          applicant_name: `${formData.first_name} ${formData.last_name}`.trim() || formData.email,
          applicant_email: formData.email,
        }),
      }).catch(() => {});

      toast({ title: 'Application submitted', description: `Application for ${formData.first_name} ${formData.last_name} has been created.` });
      
      // Reset
      setFormData({ ...defaultFormData });
      setStep(1);
      setErrors({});
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit application', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setFormData({ ...defaultFormData });
      setStep(1);
      setErrors({});
      onClose();
    }
  };

  const isLastStep = step === 9;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <div className="p-6">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-bold">Staff-Assisted Application</SheetTitle>
            <p className="text-sm text-muted-foreground">Fill out the application on behalf of an applicant</p>
          </SheetHeader>

          <FormProgress currentStep={step} totalSteps={9} stepLabels={STEP_LABELS} />

          {Object.keys(errors).length > 0 && (
            <div className="my-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive font-medium">
              Please fix the highlighted fields before continuing.
            </div>
          )}

          <div className="mt-4 bg-white border border-border rounded-2xl p-6">
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

          <div className="flex items-center justify-between mt-6 gap-3">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={step === 1}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit Application
              </Button>
            ) : (
              <Button onClick={goNext} className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light">
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
