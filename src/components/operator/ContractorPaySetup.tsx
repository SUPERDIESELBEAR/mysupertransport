import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard, CheckCircle2, User, Building2, Phone, Mail,
  AlertTriangle, Info, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import PayrollCalendar from '@/components/operator/PayrollCalendar';

interface ContractorPaySetupProps {
  operatorId: string;
  onSubmitted?: () => void;
}

interface PaySetupRow {
  id: string;
  contractor_type: string;
  legal_first_name: string;
  legal_last_name: string;
  business_name: string | null;
  phone: string;
  email: string;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  submitted_at: string | null;
}

export default function ContractorPaySetup({ operatorId, onSubmitted }: ContractorPaySetupProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<PaySetupRow | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(true);

  // Form fields
  const [contractorType, setContractorType] = useState<'individual' | 'business'>('individual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Load existing record + pre-fill from profile
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contractor_pay_setup' as any)
        .select('*')
        .eq('operator_id', operatorId)
        .maybeSingle();

      if (data) {
        const row = data as unknown as PaySetupRow;
        setExisting(row);
        setContractorType(row.contractor_type as 'individual' | 'business');
        setFirstName(row.legal_first_name);
        setLastName(row.legal_last_name);
        setBusinessName(row.business_name ?? '');
        setPhone(row.phone);
        setEmail(row.email);
        setTermsAccepted(row.terms_accepted);
      } else {
        // Pre-fill from profile
        setFirstName(profile?.first_name ?? '');
        setLastName(profile?.last_name ?? '');
        setPhone(profile?.phone ?? '');
        // Fetch email from applications table
        const { data: op } = await supabase
          .from('operators')
          .select('application_id')
          .eq('id', operatorId)
          .maybeSingle();
        if ((op as any)?.application_id) {
          const { data: app } = await supabase
            .from('applications')
            .select('email, phone')
            .eq('id', (op as any).application_id)
            .maybeSingle();
          if (app) {
            setEmail((app as any).email ?? '');
            if (!(profile?.phone)) setPhone((app as any).phone ?? '');
          }
        }
      }
      setLoading(false);
    };
    load();
  }, [operatorId, profile]);

  const isSubmitted = !!existing?.submitted_at && existing?.terms_accepted;

  const requiredFilled = (() => {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (contractorType === 'business' && !businessName.trim()) return false;
    if (!phone.trim() || !email.trim()) return false;
    if (!termsAccepted) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!requiredFilled || !user) return;
    setSaving(true);
    try {
      const payload = {
        operator_id: operatorId,
        contractor_type: contractorType,
        legal_first_name: firstName.trim(),
        legal_last_name: lastName.trim(),
        business_name: contractorType === 'business' ? businessName.trim() : null,
        phone: phone.trim(),
        email: email.trim(),
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let error: any;
      if (existing) {
        ({ error } = await supabase
          .from('contractor_pay_setup' as any)
          .update(payload)
          .eq('operator_id', operatorId));
      } else {
        ({ error } = await supabase
          .from('contractor_pay_setup' as any)
          .insert(payload));
      }

      if (error) throw error;

      toast({ title: 'Pay setup submitted!', description: 'Your payroll information has been received.' });
      // Reload
      const { data } = await supabase
        .from('contractor_pay_setup' as any)
        .select('*')
        .eq('operator_id', operatorId)
        .maybeSingle();
      if (data) setExisting(data as unknown as PaySetupRow);
      onSubmitted?.();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── SUBMITTED STATE ──
  if (isSubmitted) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-status-complete/30 bg-status-complete/8 p-5 flex items-start gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-complete/15 shrink-0">
            <CheckCircle2 className="h-5 w-5 text-status-complete" />
          </span>
          <div>
            <p className="text-sm font-bold text-status-complete">Pay Setup Submitted ✓</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Your payroll information has been received. Our team will set up your contractor account and reach out with confirmation.
            </p>
            {existing?.submitted_at && (
              <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                Submitted {new Date(existing.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Submitted Information</p>
          </div>
          <div className="divide-y divide-border/60">
            {[
              { label: 'Contractor Type', value: existing?.contractor_type === 'business' ? 'Business' : 'Individual' },
              { label: 'Legal Name', value: `${existing?.legal_first_name} ${existing?.legal_last_name}` },
              ...(existing?.contractor_type === 'business' && existing?.business_name
                ? [{ label: 'Business Name', value: existing.business_name }] : []),
              { label: 'Phone', value: existing?.phone ?? '' },
              { label: 'Email', value: existing?.email ?? '' },
              { label: 'Terms Accepted', value: existing?.terms_accepted ? '✓ Yes' : 'No' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 px-5 py-3">
                <span className="text-xs text-muted-foreground w-32 shrink-0">{row.label}</span>
                <span className="text-sm font-medium text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── FORM STATE ──
  return (
    <div className="space-y-5">

      {/* ── PAYROLL INSTRUCTIONS ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
        <button
          onClick={() => setInstructionsOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-primary/8 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Info className="h-4 w-4 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">About Our Payroll Process</p>
            <p className="text-xs text-muted-foreground mt-0.5">Read before completing this form</p>
          </div>
          {instructionsOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {instructionsOpen && (
          <div className="border-t border-primary/15 px-5 py-4 space-y-3 text-sm text-foreground leading-relaxed">
            {/* ─────────────────────────────────────────────────────── */}
            {/* PAYROLL_INSTRUCTIONS_CONTENT                            */}
            {/* Replace the placeholder below with your payroll         */}
            {/* process instructions once you provide the content.      */}
            {/* ─────────────────────────────────────────────────────── */}
            <p className="font-semibold text-foreground">How Contractor Pay Works at SUPERTRANSPORT</p>
            <p className="text-muted-foreground text-xs">
              [Payroll instructions content will be added here. Please provide the text and any document links you would like displayed in this section.]
            </p>
            <div className="rounded-lg border border-gold/30 bg-gold/8 px-4 py-3 flex items-start gap-2.5 mt-2">
              <AlertTriangle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
              <p className="text-xs text-gold leading-snug">
                You must read and acknowledge the payroll terms below before submitting this form.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── CONTRACTOR TYPE ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contractor Type</p>
        </div>
        <div className="p-5 flex gap-3">
          {(['individual', 'business'] as const).map(type => (
            <button
              key={type}
              onClick={() => setContractorType(type)}
              className={`flex-1 flex flex-col items-center gap-2.5 rounded-xl border-2 px-4 py-4 transition-all ${
                contractorType === type
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40'
              }`}
            >
              {type === 'individual'
                ? <User className="h-5 w-5" />
                : <Building2 className="h-5 w-5" />
              }
              <span className="text-sm font-semibold capitalize">{type}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── LEGAL NAME ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Legal Name</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-first-name" className="text-xs font-semibold">Legal First Name <span className="text-destructive">*</span></Label>
            <Input
              id="pay-first-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="As it appears on government ID"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-last-name" className="text-xs font-semibold">Legal Last Name <span className="text-destructive">*</span></Label>
            <Input
              id="pay-last-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="As it appears on government ID"
              maxLength={100}
            />
          </div>
        </div>

        {/* Business name — conditional */}
        {contractorType === 'business' && (
          <div className="px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="pay-business-name" className="text-xs font-semibold">
                Legal Business Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pay-business-name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="Exact legal name of your business entity"
                maxLength={200}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── CONTACT INFO ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contact Information</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-phone" className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pay-phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              maxLength={20}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-email" className="text-xs font-semibold flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pay-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              maxLength={255}
            />
          </div>
        </div>
      </div>

      {/* ── TERMS & CONDITIONS TOGGLE ── */}
      <div className={`rounded-xl border-2 p-5 transition-colors ${
        termsAccepted ? 'border-status-complete/40 bg-status-complete/5' : 'border-border bg-card'
      }`}>
        <div className="flex items-start gap-4">
          <Switch
            id="pay-terms"
            checked={termsAccepted}
            onCheckedChange={setTermsAccepted}
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="pay-terms" className="flex-1 cursor-pointer">
            <p className={`text-sm font-semibold leading-snug ${termsAccepted ? 'text-status-complete' : 'text-foreground'}`}>
              I have read and understood the payroll terms and conditions
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              By enabling this toggle, you confirm that you have reviewed the payroll process information above and agree to the terms outlined.
            </p>
          </label>
          {termsAccepted && (
            <CheckCircle2 className="h-5 w-5 text-status-complete shrink-0 mt-0.5" />
          )}
        </div>
      </div>

      {/* ── SUBMIT BUTTON ── */}
      <Button
        onClick={handleSubmit}
        disabled={!requiredFilled || saving}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-sm font-bold gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Submit Pay Setup
          </>
        )}
      </Button>

      {!termsAccepted && (
        <p className="text-center text-xs text-muted-foreground">
          You must accept the payroll terms and conditions to submit.
        </p>
      )}
    </div>
  );
}
