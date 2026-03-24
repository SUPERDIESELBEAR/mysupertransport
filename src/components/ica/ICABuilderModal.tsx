import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, ChevronRight, ChevronLeft, Save, Send, FileText, Pen, Clock } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import SignatureCanvas from 'react-signature-canvas';
import ICADocumentView from './ICADocumentView';

interface ICABuilderModalProps {
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  applicationData?: {
    address_street?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_zip?: string | null;
    phone?: string | null;
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  onClose: () => void;
  onSent: () => void;
}

type ICAData = {
  // Appendix A
  truck_year: string;
  truck_make: string;
  truck_model: string;
  truck_vin: string;
  truck_plate: string;
  truck_plate_state: string;
  trailer_number: string;
  owner_business_name: string;
  owner_ein_ssn: string;
  owner_address: string;
  owner_city: string;
  owner_state: string;
  owner_zip: string;
  owner_phone: string;
  owner_email: string;
  // Appendix B
  linehaul_split_pct: number;
  // Appendix C
  lease_effective_date: string;
  lease_termination_date: string;
  equipment_location_city: string;
  equipment_location_state: string;
};

const STEPS = ['Equipment Info', 'Review ICA', 'Carrier Signature', 'Send to Operator'];

export default function ICABuilderModal({
  operatorId, operatorName, operatorEmail, applicationData, onClose, onSent
}: ICABuilderModalProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [draftResumed, setDraftResumed] = useState(false);
  const [draftLastSaved, setDraftLastSaved] = useState<string | null>(null);

  const carrierSigRef = useRef<SignatureCanvas>(null);
  const [carrierTypedName, setCarrierTypedName] = useState('');
  const [carrierTitle, setCarrierTitle] = useState('');

  const [data, setData] = useState<ICAData>({
    truck_year: new Date().getFullYear().toString(),
    truck_make: '',
    truck_model: '',
    truck_vin: '',
    truck_plate: '',
    truck_plate_state: applicationData?.address_state ?? 'MO',
    trailer_number: '',
    owner_business_name: operatorName,
    owner_ein_ssn: '',
    owner_address: applicationData?.address_street ?? '',
    owner_city: applicationData?.address_city ?? '',
    owner_state: applicationData?.address_state ?? '',
    owner_zip: applicationData?.address_zip ?? '',
    owner_phone: applicationData?.phone ?? '',
    owner_email: applicationData?.email ?? operatorEmail,
    linehaul_split_pct: 72,
    lease_effective_date: new Date().toISOString().split('T')[0],
    lease_termination_date: '',
    equipment_location_city: 'Pleasant Hill',
    equipment_location_state: 'MO',
  });

  const set = (field: keyof ICAData, value: string | number) =>
    setData(prev => ({ ...prev, [field]: value }));

  // ── Load existing draft on mount ──────────────────────────────────────────
  useEffect(() => {
    const loadDraft = async () => {
      const { data: existing } = await supabase
        .from('ica_contracts' as any)
        .select('*')
        .eq('operator_id', operatorId)
        .in('status', ['draft', 'sent_to_operator'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existing) return;
      const row = existing as any;

      setContractId(row.id);
      setDraftResumed(true);
      setDraftLastSaved(row.updated_at ?? null);

      setData({
        truck_year: row.truck_year ?? new Date().getFullYear().toString(),
        truck_make: row.truck_make ?? '',
        truck_model: row.truck_model ?? '',
        truck_vin: row.truck_vin ?? '',
        truck_plate: row.truck_plate ?? '',
        truck_plate_state: row.truck_plate_state ?? applicationData?.address_state ?? 'MO',
        trailer_number: row.trailer_number ?? '',
        owner_business_name: row.owner_business_name ?? operatorName,
        owner_ein_ssn: row.owner_ein_ssn ?? '',
        owner_address: row.owner_address ?? applicationData?.address_street ?? '',
        owner_city: row.owner_city ?? applicationData?.address_city ?? '',
        owner_state: row.owner_state ?? applicationData?.address_state ?? '',
        owner_zip: row.owner_zip ?? applicationData?.address_zip ?? '',
        owner_phone: row.owner_phone ?? applicationData?.phone ?? '',
        owner_email: row.owner_email ?? applicationData?.email ?? operatorEmail,
        linehaul_split_pct: row.linehaul_split_pct ?? 72,
        lease_effective_date: row.lease_effective_date ?? new Date().toISOString().split('T')[0],
        lease_termination_date: row.lease_termination_date ?? '',
        equipment_location_city: row.equipment_location ? row.equipment_location.split(',')[0].trim() : 'Pleasant Hill',
        equipment_location_state: row.equipment_location ? (row.equipment_location.split(',')[1] ?? '').trim() : 'MO',
      });

      if (row.carrier_typed_name) setCarrierTypedName(row.carrier_typed_name);
      if (row.carrier_title) setCarrierTitle(row.carrier_title);
    };
    loadDraft();
  }, [operatorId]);

  const uploadSignature = async (sigRef: React.RefObject<SignatureCanvas>, folder: string) => {
    if (!sigRef.current || sigRef.current.isEmpty()) return null;
    const dataUrl = sigRef.current.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${folder}/${operatorId}-${Date.now()}.png`;
    const { error } = await supabase.storage.from('ica-signatures').upload(path, blob, { contentType: 'image/png', upsert: true });
    if (error) throw error;
    return path;
  };

  // ── Save & Close (in_progress) — available on every step ─────────────────
  const handleSaveAndClose = async () => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      // Upload carrier sig if already signed
      let carrierSigUrl: string | null = null;
      if (carrierSigRef.current && !carrierSigRef.current.isEmpty()) {
        carrierSigUrl = await uploadSignature(carrierSigRef, 'carrier');
      }

      const payload = {
        operator_id: operatorId,
        ...data,
        equipment_location: [data.equipment_location_city, data.equipment_location_state].filter(Boolean).join(', ') || null,
        lease_effective_date: data.lease_effective_date || null,
        lease_termination_date: data.lease_termination_date || null,
        carrier_typed_name: carrierTypedName || null,
        carrier_title: carrierTitle || null,
        ...(carrierSigUrl ? { carrier_signature_url: carrierSigUrl } : {}),
        status: 'draft',
      };

      let result;
      if (contractId) {
        result = await supabase.from('ica_contracts' as any).update(payload).eq('id', contractId).select().single();
      } else {
        result = await supabase.from('ica_contracts' as any).insert(payload).select().single();
      }
      if (result.error) throw result.error;
      if (!contractId) setContractId((result.data as any).id);

      // Set ica_status = 'in_progress' on onboarding_status (only if not already sent/complete)
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id, ica_status')
        .eq('operator_id', operatorId)
        .maybeSingle();
      if (os?.id && (os.ica_status === 'not_issued' || os.ica_status === 'in_progress')) {
        await supabase.from('onboarding_status').update({ ica_status: 'in_progress' as any }).eq('id', os.id);
      }

      toast({ title: 'Draft saved', description: 'ICA is saved as "In Progress". You can continue anytime.' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error saving draft', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSend = async () => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      let carrierSigUrl: string | null = null;
      if (carrierSigRef.current && !carrierSigRef.current.isEmpty()) {
        carrierSigUrl = await uploadSignature(carrierSigRef, 'carrier');
      }

      const payload = {
        operator_id: operatorId,
        ...data,
        equipment_location: [data.equipment_location_city, data.equipment_location_state].filter(Boolean).join(', ') || null,
        lease_effective_date: data.lease_effective_date || null,
        lease_termination_date: data.lease_termination_date || null,
        carrier_typed_name: carrierTypedName,
        carrier_title: carrierTitle,
        carrier_signature_url: carrierSigUrl,
        carrier_signed_by: session?.user?.id ?? null,
        carrier_signed_at: new Date().toISOString(),
        status: 'sent_to_operator',
      };

      let result;
      if (contractId) {
        result = await supabase.from('ica_contracts' as any).update(payload).eq('id', contractId).select().single();
      } else {
        result = await supabase.from('ica_contracts' as any).insert(payload).select().single();
      }

      if (result.error) throw result.error;

      // Update onboarding status to sent_for_signature
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', operatorId)
        .maybeSingle();
      if (os?.id) {
        await supabase.from('onboarding_status').update({ ica_status: 'sent_for_signature' }).eq('id', os.id);
      }

      // Write audit log entry
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', user?.id ?? '')
          .maybeSingle();
        const actorName = profile
          ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || user?.email
          : user?.email;
        await supabase.from('audit_log').insert({
          actor_id: user?.id ?? null,
          actor_name: actorName ?? null,
          action: 'ica_issued',
          entity_type: 'operator',
          entity_id: operatorId,
          entity_label: operatorName,
          metadata: {
            operator_email: operatorEmail,
            truck: [data.truck_year, data.truck_make, data.truck_model].filter(Boolean).join(' ') || null,
            truck_vin: data.truck_vin || null,
            linehaul_split_pct: data.linehaul_split_pct,
            lease_effective_date: data.lease_effective_date || null,
            contract_id: result.data ? (result.data as any).id : null,
          },
        });
      } catch (auditErr) {
        console.warn('Audit log write failed:', auditErr);
      }

      // Fire in-app + email notification to operator
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: 'onboarding_milestone',
            operator_id: operatorId,
            operator_name: operatorName,
            operator_email: operatorEmail,
            milestone: 'ICA Agreement Sent for Signature',
            milestone_key: 'ica_sent',
          },
        });
      } catch (notifErr) {
        console.warn('Notification send failed:', notifErr);
      }

      toast({ title: 'ICA sent to operator', description: `${operatorName} can now review and sign.` });
      onSent();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Legacy silent save (used internally when progressing steps)
  const handleSaveDraft = async () => {
    if (guardDemo()) return;
    setSaving(true);
    try {
      const payload = { operator_id: operatorId, ...data, equipment_location: [data.equipment_location_city, data.equipment_location_state].filter(Boolean).join(', ') || null, lease_effective_date: data.lease_effective_date || null, lease_termination_date: data.lease_termination_date || null, status: 'draft' };
      let result;
      if (contractId) {
        result = await supabase.from('ica_contracts' as any).update(payload).eq('id', contractId).select().single();
      } else {
        result = await supabase.from('ica_contracts' as any).insert(payload).select().single();
      }
      if (result.error) throw result.error;
      if (!contractId) setContractId((result.data as any).id);
      toast({ title: 'Draft saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const canProceedStep0 = !!(data.truck_vin && data.owner_business_name);
  const canProceedStep2 = !!(carrierTypedName && carrierTitle);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-3xl h-full bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Independent Contractor Agreement</h2>
            <p className="text-sm text-surface-dark-muted">{operatorName}</p>
          </div>
          <button onClick={onClose} className="text-surface-dark-muted hover:text-white p-1 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resuming draft banner */}
        {draftResumed && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-status-progress/10 border-b border-status-progress/20 text-status-progress shrink-0">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">
              Resuming saved draft
              {draftLastSaved && (
                <span className="font-normal opacity-70 ml-1">
                  — last saved {new Date(draftLastSaved).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 pt-4 pb-3 shrink-0 border-b border-border">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 text-xs font-medium px-1 transition-colors ${
                  i === step ? 'text-gold' : i < step ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'text-muted-foreground/40 cursor-default'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  i < step ? 'bg-gold/20 border-gold/50 text-gold' : i === step ? 'bg-gold text-surface-dark border-gold' : 'border-border text-muted-foreground/40'
                }`}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/30 mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gold" /> Appendix A — Equipment Identification
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Year" value={data.truck_year} onChange={v => set('truck_year', v)} placeholder="2020" />
                  <FormField label="Make" value={data.truck_make} onChange={v => set('truck_make', v)} placeholder="Freightliner" />
                  <FormField label="Model" value={data.truck_model} onChange={v => set('truck_model', v)} placeholder="Cascadia" />
                  <FormField label="VIN *" value={data.truck_vin} onChange={v => set('truck_vin', v)} placeholder="1FUJGLDR..." span={2} />
                  <FormField label="License Plate" value={data.truck_plate} onChange={v => set('truck_plate', v)} placeholder="ABC1234" />
                  <FormField label="Plate State" value={data.truck_plate_state} onChange={v => set('truck_plate_state', v)} placeholder="MO" />
                  <FormField label="Trailer # / VIN" value={data.trailer_number} onChange={v => set('trailer_number', v)} placeholder="Optional" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Owner / Business Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Owner / Business Name *" value={data.owner_business_name} onChange={v => set('owner_business_name', v)} placeholder="John Doe LLC" span={2} />
                  <FormField label="EIN or SSN" value={data.owner_ein_ssn} onChange={v => set('owner_ein_ssn', v)} placeholder="XX-XXXXXXX" />
                  <FormField label="Address" value={data.owner_address} onChange={v => set('owner_address', v)} placeholder="123 Main St" />
                  <FormField label="City" value={data.owner_city} onChange={v => set('owner_city', v)} placeholder="Kansas City" />
                  <FormField label="State" value={data.owner_state} onChange={v => set('owner_state', v)} placeholder="MO" />
                  <FormField label="ZIP" value={data.owner_zip} onChange={v => set('owner_zip', v)} placeholder="64080" />
                  <FormField label="Phone" value={data.owner_phone} onChange={v => set('owner_phone', v)} placeholder="816-555-0100" />
                  <FormField label="Email" value={data.owner_email} onChange={v => set('owner_email', v)} placeholder="operator@email.com" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Appendix B — Compensation</h3>
                <div className="flex items-center gap-4 p-4 bg-gold/5 border border-gold/20 rounded-xl">
                  <div className="flex-1">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner-Operator Linehaul Split (%)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Contractor's share of adjusted gross linehaul revenue</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={data.linehaul_split_pct}
                      onChange={e => set('linehaul_split_pct', parseInt(e.target.value) || 72)}
                      className="w-20 text-center font-bold text-lg h-10"
                    />
                    <span className="text-lg font-bold text-gold">%</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Appendix C — Equipment Receipt</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Lease Effective Date" value={data.lease_effective_date} onChange={v => set('lease_effective_date', v)} type="date" />
                  <FormField label="Lease Termination Date (optional)" value={data.lease_termination_date} onChange={v => set('lease_termination_date', v)} type="date" />
                  <FormField label="Equipment Location — City" value={data.equipment_location_city} onChange={v => set('equipment_location_city', v)} placeholder="Pleasant Hill" />
                  <FormField label="Equipment Location — State" value={data.equipment_location_state} onChange={v => set('equipment_location_state', v)} placeholder="MO" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">Review the complete ICA document before signing.</p>
              <ICADocumentView data={data} operatorName={operatorName} previewMode />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 bg-gold/5 border border-gold/20 rounded-xl">
                <p className="text-sm font-medium text-foreground mb-1">Carrier — SUPERTRANSPORT, LLC</p>
                <p className="text-xs text-muted-foreground">PO Box 4, Pleasant Hill, MO 64080</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Typed Full Name *</Label>
                  <Input value={carrierTypedName} onChange={e => setCarrierTypedName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title *</Label>
                  <Input value={carrierTitle} onChange={e => setCarrierTitle(e.target.value)} placeholder="e.g. Operations Manager" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Pen className="h-3.5 w-3.5" /> Carrier Signature <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
                  </Label>
                  <button
                    onClick={() => carrierSigRef.current?.clear()}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
                  <SignatureCanvas
                    ref={carrierSigRef}
                    canvasProps={{ width: 600, height: 180, className: 'w-full' }}
                    penColor="#1a1a1a"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Sign above with your mouse or touch input — or leave blank to send without a drawn signature.</p>
              </div>
              <p className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg p-3">
                By signing, you confirm this agreement is authorized on behalf of SUPERTRANSPORT, LLC and will be sent to the operator for their review and signature. Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="p-5 bg-gold/5 border border-gold/30 rounded-xl text-center space-y-2">
                <Send className="h-8 w-8 text-gold mx-auto" />
                <h3 className="font-semibold text-foreground">Ready to send to operator</h3>
                <p className="text-sm text-muted-foreground">
                  The ICA has been pre-filled and signed by you as Carrier. <strong>{operatorName}</strong> will be able to review the full agreement and sign digitally from their operator portal.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Operator</span>
                  <span className="font-medium">{operatorName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Truck</span>
                  <span className="font-medium">{[data.truck_year, data.truck_make, data.truck_model].filter(Boolean).join(' ') || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Linehaul Split</span>
                  <span className="font-medium text-gold">{data.linehaul_split_pct}%</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Effective Date</span>
                  <span className="font-medium">{data.lease_effective_date || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Carrier Signed By</span>
                  <span className="font-medium">{carrierTypedName}, {carrierTitle}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary/30 shrink-0 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {/* Save & Close available on every step */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveAndClose}
              disabled={saving}
              className="text-muted-foreground hover:text-foreground gap-1.5"
            >
              <DemoLockIcon />
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </div>

          <div className="flex gap-2">
            {step < STEPS.length - 1 && (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={(step === 0 && !canProceedStep0) || (step === 2 && !canProceedStep2)}
                className="bg-gold text-surface-dark font-semibold hover:bg-gold-light gap-1.5"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === STEPS.length - 1 && (
              <Button
                onClick={handleSaveAndSend}
                disabled={saving}
                className="bg-gold text-surface-dark font-semibold hover:bg-gold-light gap-1.5"
              >
                <Send className="h-4 w-4" />
                {saving ? 'Sending…' : 'Send to Operator'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text', span }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; span?: number;
}) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'col-span-2' : ''}`}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}
