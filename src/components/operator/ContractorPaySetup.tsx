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
  AlertTriangle, Info, Loader2, ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import PayrollCalendar from '@/components/operator/PayrollCalendar';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { formatPhoneDisplay, formatPhoneInput } from '@/lib/utils';

// ── Company payroll reference documents ──────────────────────────────────────
const COMPANY_DOCS = [
  {
    key: 'deposit_overview',
    title: 'Payroll Deposit Overview',
    storagePath: 'company-docs/payroll-deposit-overview.pdf',
    description: 'Payroll deposit policy & Everee setup guide',
  },
  {
    key: 'payroll_calendar',
    title: 'Payroll Calendar',
    storagePath: 'company-docs/payroll-calendar.pdf',
    description: 'Weekly settlement schedule & pay dates',
  },
] as const;

type DocKey = typeof COMPANY_DOCS[number]['key'];

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
  deposit_overview_acknowledged: boolean;
  payroll_calendar_acknowledged: boolean;
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

  // Document acknowledgments
  const [docAcknowledged, setDocAcknowledged] = useState<Record<DocKey, boolean>>({
    deposit_overview: false,
    payroll_calendar: false,
  });
  const [docUrls, setDocUrls] = useState<Record<DocKey, string | null>>({
    deposit_overview: null,
    payroll_calendar: null,
  });
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null);

  // Fetch signed URLs for company reference docs
  useEffect(() => {
    Promise.all(
      COMPANY_DOCS.map(doc =>
        supabase.storage.from('operator-documents').createSignedUrl(doc.storagePath, 3600)
          .then(r => ({ key: doc.key, url: r.data?.signedUrl ?? null }))
      )
    ).then(results => {
      const urls = {} as Record<DocKey, string | null>;
      results.forEach(r => { urls[r.key as DocKey] = r.url; });
      setDocUrls(urls);
    });
  }, []);

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
        // Restore persisted acknowledgments
        setDocAcknowledged({
          deposit_overview: row.deposit_overview_acknowledged ?? false,
          payroll_calendar: row.payroll_calendar_acknowledged ?? false,
        });
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

  const allDocsAcknowledged = COMPANY_DOCS.every(doc => docAcknowledged[doc.key]);

  const requiredFilled = (() => {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (contractorType === 'business' && !businessName.trim()) return false;
    if (!phone.trim() || !email.trim()) return false;
    if (!allDocsAcknowledged) return false;
    if (!termsAccepted) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!requiredFilled || !user) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        operator_id: operatorId,
        contractor_type: contractorType,
        legal_first_name: firstName.trim(),
        legal_last_name: lastName.trim(),
        business_name: contractorType === 'business' ? businessName.trim() : null,
        phone: phone.trim(),
        email: email.trim(),
        terms_accepted: true,
        terms_accepted_at: now,
        submitted_at: now,
        updated_at: now,
        deposit_overview_acknowledged: docAcknowledged.deposit_overview,
        payroll_calendar_acknowledged: docAcknowledged.payroll_calendar,
        deposit_overview_acknowledged_at: docAcknowledged.deposit_overview ? now : null,
        payroll_calendar_acknowledged_at: docAcknowledged.payroll_calendar ? now : null,
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
              { label: 'Phone', value: formatPhoneDisplay(existing?.phone) },
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
            {/* ── INTRO ── */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              SUPERTRANSPORT operates a structured weekly settlement system designed for accuracy, transparency, and consistency. Understanding the cycle below will help you plan your finances and know exactly when to expect payment.
            </p>

            {/* ── 3 NUMBERED CARDS ── */}
            <div className="space-y-2.5 mt-1">
              {[
                {
                  num: "1",
                  title: "The Work Week",
                  color: "bg-[#B5D4F4]/30 border-[#B5D4F4]",
                  numColor: "bg-[#B5D4F4] text-[#0C447C]",
                  body: "Wednesday 12:00 a.m. through Tuesday 11:59 p.m. All loads delivered during this period are grouped together for settlement.",
                },
                {
                  num: "2",
                  title: "The Reconciliation Period",
                  color: "bg-[#FAC775]/20 border-[#FAC775]",
                  numColor: "bg-[#FAC775] text-[#633806]",
                  body: "After the Work Week closes, we verify delivery paperwork, revenue billing, fuel purchases, cash advances, approved accessorials, and authorized deductions.",
                },
                {
                  num: "3",
                  title: "Payday",
                  color: "bg-[#C0DD97]/20 border-[#C0DD97]",
                  numColor: "bg-[#C0DD97] text-[#27500A]",
                  body: "You are paid every Tuesday for the Work Week that ended two (2) Tuesdays prior. Settlement statements are issued the same day.",
                },
              ].map(({ num, title, color, numColor, body }) => (
                <div key={num} className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${color}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${numColor}`}>
                    {num}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-foreground leading-snug">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── PAYROLL CALENDAR ── */}
            <div className="mt-2">
              <PayrollCalendar />
            </div>

            {/* ── DETAIL ROWS ── */}
            <div className="rounded-lg border border-border overflow-hidden mt-1">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Settlement Details</p>
              </div>
              {[
                {
                  label: "Fuel",
                  detail: "Fuel purchases made on the company fuel card during your Work Week are reconciled and deducted from your settlement. Retail fuel receipts submitted for reimbursement are also processed during this period.",
                },
                {
                  label: "Accessorials",
                  detail: "Approved accessorial pay (layovers, detention, lumper reimbursements, etc.) is verified and added to your settlement during reconciliation. Unapproved or undocumented accessorials will not be included.",
                },
                {
                  label: "Cash Advances",
                  detail: "Any cash advances taken during the Work Week are reconciled against your settlement. Advances must be documented and pre-approved. Repayment is automatic on your next settlement.",
                },
              ].map(({ label, detail }) => (
                <div key={label} className="flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0">
                  <span className="text-xs font-bold text-foreground w-24 shrink-0 pt-0.5">{label}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
                </div>
              ))}
            </div>

            {/* ── SIMPLE RULE CALLOUT ── */}
            <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-4 py-3 text-center mt-1">
              <p className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Simple rule:</span> You are paid every{" "}
                <span className="font-bold">Tuesday</span> for the work week that ended{" "}
                <span className="font-bold">two Tuesdays prior.</span>
              </p>
            </div>

            {/* ── DEPOSIT & VISA CARD SECTION ── */}
            <div className="rounded-lg border border-border overflow-hidden mt-1">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Payroll Deposit & Visa Card</p>
              </div>

              {/* Important callout */}
              <div className="px-4 pt-3 pb-2">
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <p className="text-xs text-foreground leading-relaxed">
                    <span className="font-bold">Important:</span> Tuesday is our payroll processing day. Standard bank deposits typically post the <span className="font-semibold">following business day</span>. Drivers who want faster access to funds may choose the Payroll Visa card / virtual card option.
                  </p>
                </div>
              </div>

              {[
                {
                  label: "How Deposits Work",
                  detail: "SUPERTRANSPORT submits payroll through Everee during normal business hours on Tuesday. Once submitted, funds move through Everee and the receiving bank. Standard bank deposits typically post the following business day. The exact posting time is controlled by the banking system and the receiving bank — not by SUPERTRANSPORT.",
                },
                {
                  label: "Payroll Visa Card",
                  detail: "Everee offers a Payroll Visa card / virtual card option that can make funds available immediately after payroll is processed, without waiting on the normal bank transfer timeline. You can still link your bank account to the card and sweep funds to your bank at any time. This is often the best option for drivers who want the fastest access to their settlement funds.",
                },
                {
                  label: "Alvys Settlements",
                  detail: "Seeing a settlement posted in Alvys means it has been calculated and is available to review — it does not mean the bank deposit has already landed. Payroll processing and bank posting are separate steps. A settlement may appear in Alvys before the deposit reaches your account.",
                },
              ].map(({ label, detail }) => (
                <div key={label} className="flex items-start gap-3 px-4 py-3 border-t border-border/60">
                  <span className="text-xs font-bold text-foreground w-28 shrink-0 pt-0.5">{label}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
                </div>
              ))}
            </div>

            {/* ── WARNING STRIP ── */}
            <div className="rounded-lg border border-gold/30 bg-gold/8 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-gold shrink-0 mt-0.5" />
              <p className="text-xs text-gold leading-snug">
                You must read and acknowledge the payroll terms below before submitting this form.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── PAYROLL REFERENCE DOCUMENTS (gates the form below) ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payroll Reference Documents</p>
          {allDocsAcknowledged && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-status-complete">
              <CheckCircle2 className="h-3.5 w-3.5" /> Both acknowledged
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            Please review both documents below and toggle each acknowledgment to confirm you have read them. <span className="font-semibold text-foreground">You must acknowledge both documents before you can fill in the setup form below.</span>
          </p>
          {COMPANY_DOCS.map(doc => {
            const acked = docAcknowledged[doc.key];
            const url = docUrls[doc.key];
            const toggle = () =>
              setDocAcknowledged(prev => ({ ...prev, [doc.key]: !prev[doc.key] }));
            return (
              <div
                key={doc.key}
                className={`rounded-lg border-2 transition-colors ${acked ? 'border-status-complete/40 bg-status-complete/5' : 'border-border bg-background'}`}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${acked ? 'bg-status-complete/15' : 'bg-muted'}`}>
                    <FileText className={`h-4 w-4 ${acked ? 'text-status-complete' : 'text-muted-foreground'}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">{doc.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{doc.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!url}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (url) setPreviewDoc({ title: doc.title, url });
                    }}
                    className="shrink-0 text-xs h-8 px-3"
                  >
                    View
                  </Button>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                  className="border-t border-border/60 px-4 py-3 flex items-center gap-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                >
                  <Switch
                    checked={acked}
                    onCheckedChange={(val) =>
                      setDocAcknowledged(prev => ({ ...prev, [doc.key]: val }))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <span className="flex-1">
                    <p className={`text-xs font-semibold ${acked ? 'text-status-complete' : 'text-foreground'}`}>
                      I have read and acknowledged this document
                    </p>
                  </span>
                  {acked && <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── GATE BANNER ── */}
      {!allDocsAcknowledged && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-50/70 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            Acknowledge both documents above to unlock the setup form.
          </p>
        </div>
      )}

      {/* ── GATED FORM SECTION ── */}
      <div className={`space-y-5 transition-opacity duration-200 ${allDocsAcknowledged ? '' : 'opacity-40 pointer-events-none select-none'}`}>

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
              onChange={e => setPhone(formatPhoneInput(e.target.value))}
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
      </div>{/* end gated form section */}

      {/* ── PDF PREVIEW MODAL ── */}
      {previewDoc && (
        <FilePreviewModal
          url={previewDoc.url}
          name={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
