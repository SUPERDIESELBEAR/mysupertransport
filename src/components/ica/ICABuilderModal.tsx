import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, ChevronRight, ChevronLeft, Save, Send, FileText, Pen, Clock, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import DemoLockIcon from '@/components/DemoLockIcon';
import SignatureCanvas from 'react-signature-canvas';
import ICADocumentView from './ICADocumentView';
import { saveTruckSpecs } from '@/lib/truckSync';

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
  truck_vin: string;
  truck_plate: string;
  truck_plate_state: string;
  trailer_number: string;
  owner_name: string;
  owner_business_name: string;
  owner_ein: string;
  owner_ssn: string;
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
};

const STEPS = ['Equipment Info', 'Review ICA', 'Carrier Signature', 'Send to Operator'];

// ── Auto-format helpers ───────────────────────────────────────────────────────
function formatEIN(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}
function formatSSN(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
function FormField({ label, value, onChange, placeholder, type = 'text', span }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; span?: number;
}) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'col-span-2' : ''}`}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {type === 'date' ? (
        <DateInput value={value} onChange={onChange} className="h-9 text-sm" />
      ) : (
        <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
      )}
    </div>
  );
}
function MaskedField({ label, value, onChange, mask, placeholder, span }: {
  label: string; value: string; onChange: (v: string) => void;
  mask: 'ein' | 'ssn' | 'phone'; placeholder?: string; span?: number;
}) {
  const handleChange = (raw: string) => {
    if (mask === 'ein') onChange(formatEIN(raw));
    else if (mask === 'ssn') onChange(formatSSN(raw));
    else onChange(formatPhone(raw));
  };
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'col-span-2' : ''}`}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input type="text" inputMode="numeric" value={value} onChange={e => handleChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}

export default function ICABuilderModal({
  operatorId, operatorName, operatorEmail, applicationData, onClose, onSent
}: ICABuilderModalProps) {
  const { session, profile, roles } = useAuth();
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
  const [defaultSig, setDefaultSig] = useState<{ typed_name: string; title: string; signature_url: string | null } | null>(null);
  const [defaultSigPreviewUrl, setDefaultSigPreviewUrl] = useState<string | null>(null);
  const [useDefaultSig, setUseDefaultSig] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const [data, setData] = useState<ICAData>({
    truck_year: new Date().getFullYear().toString(),
    truck_make: '',
    truck_vin: '',
    truck_plate: '',
    truck_plate_state: applicationData?.address_state ?? 'MO',
    trailer_number: '',
    owner_name: `${applicationData?.first_name ?? ''} ${applicationData?.last_name ?? ''}`.trim() || operatorName,
    owner_business_name: '',
    owner_ein: '',
    owner_ssn: '',
    owner_address: applicationData?.address_street ?? '',
    owner_city: applicationData?.address_city ?? '',
    owner_state: applicationData?.address_state ?? '',
    owner_zip: applicationData?.address_zip ?? '',
    owner_phone: applicationData?.phone ?? '',
    owner_email: applicationData?.email ?? operatorEmail,
    linehaul_split_pct: 72,
    lease_effective_date: new Date().toISOString().split('T')[0],
    lease_termination_date: '',
  });

  const set = (field: keyof ICAData, value: string | number) =>
    setData(prev => ({ ...prev, [field]: value }));

  // ── Load existing draft on mount ──────────────────────────────────────────
  useEffect(() => {
    const loadDraft = async () => {
      // Fetch ICA draft and onboarding truck info in parallel
      const [{ data: existing }, { data: onboardingRow }] = await Promise.all([
        supabase
          .from('ica_contracts' as any)
          .select('*')
          .eq('operator_id', operatorId)
          .in('status', ['draft', 'sent_to_operator'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('onboarding_status')
          .select('truck_year, truck_make, truck_vin, truck_plate, truck_plate_state, trailer_number')
          .eq('operator_id', operatorId)
          .maybeSingle() as any,
      ]);

      const ob = (onboardingRow as any) ?? {};

      if (!existing) {
        // No ICA draft — pre-fill from onboarding_status truck fields if available
        if (ob.truck_year || ob.truck_make || ob.truck_vin || ob.truck_plate || ob.truck_plate_state || ob.trailer_number) {
          setData(prev => ({
            ...prev,
            truck_year: ob.truck_year || prev.truck_year,
            truck_make: ob.truck_make || prev.truck_make,
            truck_vin: ob.truck_vin || prev.truck_vin,
            truck_plate: ob.truck_plate || prev.truck_plate,
            truck_plate_state: ob.truck_plate_state || prev.truck_plate_state,
            trailer_number: ob.trailer_number || prev.trailer_number,
          }));
        }
        return;
      }

      const row = existing as any;

      setContractId(row.id);
      setDraftResumed(true);
      setDraftLastSaved(row.updated_at ?? null);

      // Parse stored owner_ein_ssn back into separate fields if needed
      const storedEinSsn = row.owner_ein_ssn ?? '';
      const isEin = /^\d{2}-/.test(storedEinSsn);
      setData({
        truck_year: row.truck_year || ob.truck_year || new Date().getFullYear().toString(),
        truck_make: row.truck_make || ob.truck_make || '',
        truck_vin: row.truck_vin || ob.truck_vin || '',
        truck_plate: row.truck_plate || ob.truck_plate || '',
        truck_plate_state: row.truck_plate_state || ob.truck_plate_state || applicationData?.address_state || 'MO',
        trailer_number: row.trailer_number || ob.trailer_number || '',
        owner_name: row.owner_name ?? (`${applicationData?.first_name ?? ''} ${applicationData?.last_name ?? ''}`.trim() || operatorName),
        owner_business_name: row.owner_business_name ?? '',
        owner_ein: isEin ? storedEinSsn : '',
        owner_ssn: !isEin && storedEinSsn ? storedEinSsn : '',
        owner_address: row.owner_address ?? applicationData?.address_street ?? '',
        owner_city: row.owner_city ?? applicationData?.address_city ?? '',
        owner_state: row.owner_state ?? applicationData?.address_state ?? '',
        owner_zip: row.owner_zip ?? applicationData?.address_zip ?? '',
        owner_phone: row.owner_phone ?? applicationData?.phone ?? '',
        owner_email: row.owner_email ?? applicationData?.email ?? operatorEmail,
        linehaul_split_pct: row.linehaul_split_pct ?? 72,
        lease_effective_date: row.lease_effective_date ?? new Date().toISOString().split('T')[0],
        lease_termination_date: row.lease_termination_date ?? '',
      });

      if (row.carrier_typed_name) setCarrierTypedName(row.carrier_typed_name);
      if (row.carrier_title) setCarrierTitle(row.carrier_title);
    };
    loadDraft();
  }, [operatorId]);

  // ── Load default carrier signature settings ──
  useEffect(() => {
    const loadDefaultSig = async () => {
      const { data: row } = await supabase.from('carrier_signature_settings' as any).select('*').maybeSingle();
      if (row) {
        const sig = row as any;
        setDefaultSig({ typed_name: sig.typed_name, title: sig.title, signature_url: sig.signature_url });
        setCarrierTypedName(prev => prev || sig.typed_name);
        setCarrierTitle(prev => prev || sig.title);
        if (sig.signature_url) {
          setUseDefaultSig(true);
          // Generate signed URL for preview
          const path = sig.signature_url.includes('/ica-signatures/')
            ? sig.signature_url.split('/ica-signatures/').pop()!
            : sig.signature_url;
          const { data: signed } = await supabase.storage.from('ica-signatures').createSignedUrl(path, 3600);
          if (signed?.signedUrl) setDefaultSigPreviewUrl(signed.signedUrl);
        }
        return;
      }
      // Fallback: prefill from logged-in user profile
      if (!profile) return;
      setCarrierTypedName(prev => {
        if (prev) return prev;
        return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
      });
      setCarrierTitle(prev => {
        if (prev) return prev;
        if (roles.includes('owner')) return 'Owner';
        if (roles.includes('management')) return 'Operations Manager';
        return '';
      });
    };
    loadDefaultSig();
  }, [profile, roles]);

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
      // Upload carrier sig if already signed, else fall back to saved default
      let carrierSigUrl: string | null = null;
      if (carrierSigRef.current && !carrierSigRef.current.isEmpty()) {
        carrierSigUrl = await uploadSignature(carrierSigRef, 'carrier');
      } else if (useDefaultSig && defaultSig?.signature_url) {
        carrierSigUrl = defaultSig.signature_url;
      }


      const { owner_ein, owner_ssn, owner_name, ...restData } = data;
      const payload = {
        operator_id: operatorId,
        ...restData,
        owner_name,
        owner_ein_ssn: owner_ein || owner_ssn || null,
        equipment_location: null,
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
        const { error: statusErr } = await supabase.from('onboarding_status').update({ ica_status: 'in_progress' as any }).eq('id', os.id);
        if (statusErr) throw statusErr;
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

    // Guard: must have a signature image (newly drawn OR saved default)
    const canvasEmpty = !carrierSigRef.current || carrierSigRef.current.isEmpty();
    const hasDefault = useDefaultSig && !!defaultSig?.signature_url;
    if (canvasEmpty && !hasDefault) {
      toast({
        title: 'Carrier signature required',
        description: 'Draw your signature in the canvas, or load your saved default before sending.',
        variant: 'destructive',
      });
      return;
    }

    // Guard: block save-as-default with empty canvas
    if (saveAsDefault && canvasEmpty) {
      toast({
        title: 'Draw your signature first',
        description: 'Cannot save an empty signature as the default. Draw your signature in the canvas, then try again.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      let carrierSigUrl: string | null = null;
      if (carrierSigRef.current && !carrierSigRef.current.isEmpty()) {
        carrierSigUrl = await uploadSignature(carrierSigRef, 'carrier');
      } else if (useDefaultSig && defaultSig?.signature_url) {
        carrierSigUrl = defaultSig.signature_url;
      }

      // Save as default if requested
      if (saveAsDefault) {
        const sigPayload: any = {
          typed_name: carrierTypedName,
          title: carrierTitle,
          signature_url: carrierSigUrl,
          updated_by: session?.user?.id ?? null,
        };
        if (defaultSig) {
          await supabase.from('carrier_signature_settings' as any).update(sigPayload).neq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          await supabase.from('carrier_signature_settings' as any).insert(sigPayload);
        }
        setSaveAsDefault(false);
      }


      const { owner_ein, owner_ssn, owner_name, ...restData2 } = data;
      const payload = {
        operator_id: operatorId,
        ...restData2,
        owner_name,
        owner_ein_ssn: owner_ein || owner_ssn || null,
        equipment_location: null,
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

      // Mirror truck spec edits back to onboarding_status so Fleet Roster + Operator Portal stay in sync.
      // (Helper handles dual-write + audit. Skip the ICA mirror — we just wrote it directly above.)
      try {
        await saveTruckSpecs(
          operatorId,
          null,
          {
            truck_year: data.truck_year,
            truck_make: data.truck_make,
            truck_vin: data.truck_vin,
            truck_plate: data.truck_plate,
            truck_plate_state: data.truck_plate_state,
            trailer_number: data.trailer_number,
          },
          session?.user?.id ?? null,
          { skipIcaMirror: true, entityLabel: operatorName },
        );
      } catch (syncErr) {
        console.warn('Truck specs sync failed:', syncErr);
      }

      // Update onboarding status to sent_for_signature
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', operatorId)
        .maybeSingle();
      if (os?.id) {
        const { error: sendStatusErr } = await supabase.from('onboarding_status').update({ ica_status: 'sent_for_signature' }).eq('id', os.id);
        if (sendStatusErr) throw sendStatusErr;
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
            truck: [data.truck_year, data.truck_make].filter(Boolean).join(' ') || null,
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
      const { owner_ein: _ein, owner_ssn: _ssn, owner_name: _oname, ...restData3 } = data;
      const payload = { operator_id: operatorId, ...restData3, owner_name: _oname, owner_ein_ssn: _ein || _ssn || null, equipment_location: null, lease_effective_date: data.lease_effective_date || null, lease_termination_date: data.lease_termination_date || null, status: 'draft' };
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

  const canProceedStep0 = !!(data.truck_vin && (data.owner_name || data.owner_business_name));
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
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Make</Label>
                    <Select
                      value={['Freightliner','Kenworth','Peterbilt','Volvo','Mack','International','Western Star'].includes(data.truck_make) ? data.truck_make : data.truck_make ? '__other__' : ''}
                      onValueChange={v => { if (v === '__other__') set('truck_make', ''); else set('truck_make', v); }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select make" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Freightliner','Kenworth','Peterbilt','Volvo','Mack','International','Western Star'].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                        <SelectItem value="__other__">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {data.truck_make !== '' && !['Freightliner','Kenworth','Peterbilt','Volvo','Mack','International','Western Star'].includes(data.truck_make) && (
                      <Input value={data.truck_make} onChange={e => set('truck_make', e.target.value)} placeholder="Enter make" className="h-9 text-sm mt-1" />
                    )}
                    {data.truck_make === '' && (
                      <Input value="" onChange={e => set('truck_make', e.target.value)} placeholder="Enter make" className="h-9 text-sm mt-1" autoFocus />
                    )}
                  </div>
                  <FormField label="VIN *" value={data.truck_vin} onChange={v => set('truck_vin', v)} placeholder="1FUJGLDR..." span={2} />
                  <FormField label="License Plate" value={data.truck_plate} onChange={v => set('truck_plate', v)} placeholder="ABC1234" />
                  <FormField label="Plate State" value={data.truck_plate_state} onChange={v => set('truck_plate_state', v)} placeholder="MO" />
                  <FormField label="Trailer # / VIN" value={data.trailer_number} onChange={v => set('trailer_number', v)} placeholder="Optional" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Owner / Business Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Owner Name *" value={data.owner_name} onChange={v => set('owner_name', v)} placeholder="John Doe" />
                  <MaskedField label="SSN" value={data.owner_ssn} onChange={v => set('owner_ssn', v)} mask="ssn" placeholder="123-45-6789" />
                  <FormField label="Business Name" value={data.owner_business_name} onChange={v => set('owner_business_name', v)} placeholder="John Doe LLC" />
                  <MaskedField label="EIN" value={data.owner_ein} onChange={v => set('owner_ein', v)} mask="ein" placeholder="12-3456789" />
                  <FormField label="Address" value={data.owner_address} onChange={v => set('owner_address', v)} placeholder="123 Main St" span={2} />
                  <FormField label="City" value={data.owner_city} onChange={v => set('owner_city', v)} placeholder="Kansas City" />
                  <FormField label="State" value={data.owner_state} onChange={v => set('owner_state', v)} placeholder="MO" />
                  <FormField label="ZIP" value={data.owner_zip} onChange={v => set('owner_zip', v)} placeholder="64080" />
                  <MaskedField label="Phone" value={data.owner_phone} onChange={v => set('owner_phone', v)} mask="phone" placeholder="816-555-0100" />
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

              {/* Saved default signature banner */}
              {defaultSig && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      Saved owner signature on file
                    </p>
                    <button
                      onClick={() => {
                        setUseDefaultSig(false);
                        setDefaultSig(null);
                        setDefaultSigPreviewUrl(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Sign manually instead
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> {defaultSig.typed_name}</div>
                    <div><span className="text-muted-foreground">Title:</span> {defaultSig.title}</div>
                  </div>
                  {defaultSigPreviewUrl && (
                    <div className="border border-border rounded-lg bg-white p-2 max-w-xs">
                      <img src={defaultSigPreviewUrl} alt="Saved signature" className="h-16 object-contain" />
                    </div>
                  )}
                </div>
              )}

              {/* Manual entry — always visible so staff can override */}
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

              {/* Signature canvas — hidden when using saved default */}
              {!useDefaultSig && (
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
              )}

              {/* Save as default checkbox — shown for management/owner when not already saved */}
              {!defaultSig && (roles.includes('owner') || roles.includes('management')) && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={e => setSaveAsDefault(e.target.checked)}
                    className="rounded border-border"
                  />
                  Save this signature as the permanent default for all future ICAs
                </label>
              )}

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
                  <span className="font-medium">{[data.truck_year, data.truck_make].filter(Boolean).join(' ') || '—'}</span>
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
                <DemoLockIcon />
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

