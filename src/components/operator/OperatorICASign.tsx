import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FileText, Pen, CheckCircle2, Loader2 } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import ICADocumentView from '@/components/ica/ICADocumentView';

interface ICAData {
  id: string;
  truck_year: string; truck_make: string; truck_model: string;
  truck_vin: string; truck_plate: string; truck_plate_state: string;
  trailer_number: string; owner_business_name: string; owner_ein_ssn: string;
  owner_address: string; owner_city: string; owner_state: string; owner_zip: string;
  owner_phone: string; owner_email: string;
  linehaul_split_pct: number;
  lease_effective_date: string; lease_termination_date: string;
  status: string;
  carrier_typed_name: string; carrier_title: string;
  carrier_signature_url: string | null; carrier_signed_at: string | null;
  contractor_typed_name: string | null; contractor_signature_url: string | null; contractor_signed_at: string | null;
}

export default function OperatorICASign() {
  const { session } = useAuth();
  // removed useToast — using sonner toast directly
  const [contract, setContract] = useState<ICAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState('');

  useEffect(() => {
    if (session?.user?.id) fetchContract();
  }, [session?.user?.id]);

  const fetchContract = async () => {
    setLoading(true);
    const { data: op } = await supabase
      .from('operators')
      .select('id, user_id')
      .eq('user_id', session!.user.id)
      .maybeSingle();

    if (!op) { setLoading(false); return; }
    setOperatorId(op.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', session!.user.id)
      .maybeSingle();
    if (profile) setOperatorName([profile.first_name, profile.last_name].filter(Boolean).join(' '));

    const { data } = await supabase
      .from('ica_contracts' as any)
      .select('*')
      .eq('operator_id', op.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const raw = data as Record<string, any>;
      // Resolve signed URLs for private bucket
      const resolveUrl = async (path: string | null) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        const { data: sd } = await supabase.storage.from('ica-signatures').createSignedUrl(path, 3600);
        return sd?.signedUrl ?? null;
      };
      const [carrierUrl, contractorUrl] = await Promise.all([
        resolveUrl(raw.carrier_signature_url),
        resolveUrl(raw.contractor_signature_url),
      ]);
      setContract({ ...raw, carrier_signature_url: carrierUrl, contractor_signature_url: contractorUrl } as unknown as ICAData);
    } else {
      setContract(null);
    }
    setLoading(false);
  };

  const handleSign = async () => {
    if (!contract) return;
    if (!signedName.trim()) {
      toast.error('Please type your full name before signing.');
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error('Please draw your signature in the signature box.');
      return;
    }
    setSigning(true);
    try {
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `contractor/${operatorId}-${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage.from('ica-signatures').upload(path, blob, { contentType: 'image/png', upsert: true });
      if (uploadErr) throw uploadErr;

      const { error } = await supabase
        .from('ica_contracts' as any)
        .update({
          contractor_typed_name: signedName,
          contractor_signature_url: path,
          contractor_signed_at: new Date().toISOString(),
          status: 'fully_executed',
        })
        .eq('id', contract.id);

      if (error) throw error;

      // Update onboarding ICA status to complete
      const { data: os } = await supabase
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', operatorId!)
        .maybeSingle();
      if (os?.id) {
        await supabase.from('onboarding_status').update({ ica_status: 'complete' }).eq('id', os.id);
      }

      // Write audit log entry for ica_signed
      try {
        await supabase.from('audit_log').insert({
          entity_type: 'ica_contract',
          action: 'ica_signed',
          actor_id: session!.user.id,
          actor_name: operatorName || 'Operator',
          entity_id: operatorId ?? undefined,
          entity_label: operatorName || 'Operator',
          metadata: {
            contract_id: contract.id,
            contractor_typed_name: signedName,
            signed_at: new Date().toISOString(),
            truck_year: contract.truck_year,
            truck_make: contract.truck_make,
            truck_model: contract.truck_model,
            truck_vin: contract.truck_vin,
            linehaul_split_pct: contract.linehaul_split_pct,
          },
        });
      } catch (auditErr) {
        console.warn('ica_signed audit log failed (non-blocking):', auditErr);
      }

      // Fire ICA complete notifications (operator + assigned staff)
      try {
        const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(
          `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/send-notification`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session!.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              type: 'onboarding_milestone',
              milestone_key: 'ica_complete',
              milestone: 'ICA Agreement Fully Executed',
              operator_id: operatorId,
              operator_name: operatorName,
            }),
          }
        );
      } catch (notifErr) {
        console.warn('ICA complete notification failed (non-blocking):', notifErr);
      }

      toast.success('ICA Signed! Your Independent Contractor Agreement has been fully executed.');
      fetchContract();
    } catch (err: any) {
      toast.error(err.message || 'Error signing agreement');
    } finally {
      setSigning(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-gold" />
    </div>
  );

  if (!contract) return (
    <div className="text-center py-16 text-muted-foreground">
      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No ICA available</p>
      <p className="text-sm mt-1">Your Independent Contractor Agreement hasn't been prepared yet. Your onboarding team will send it soon.</p>
    </div>
  );

  const isFullyExecuted = contract.status === 'fully_executed';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {isFullyExecuted ? (
        <div className="flex items-center gap-3 p-4 bg-status-complete/10 border border-status-complete/30 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-status-complete shrink-0" />
          <div>
            <p className="font-semibold text-status-complete text-sm">ICA Fully Executed</p>
            <p className="text-xs text-muted-foreground mt-0.5">Signed on {new Date(contract.contractor_signed_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-gold/10 border border-gold/30 rounded-xl">
          <Pen className="h-5 w-5 text-gold shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm">Your ICA is ready to sign</p>
            <p className="text-xs text-muted-foreground mt-0.5">Review the full agreement below, then scroll to the signature section to sign.</p>
          </div>
        </div>
      )}

      <ICADocumentView
        data={{
          ...contract,
          owner_name: (contract as any).owner_name ?? '',
          owner_ein: (contract as any).owner_ein ?? '',
          owner_ssn: (contract as any).owner_ssn ?? '',
        }}
        operatorName={operatorName}
        previewMode={isFullyExecuted}
        carrierSignatureUrl={contract.carrier_signature_url}
        carrierTypedName={contract.carrier_typed_name}
        carrierTitle={contract.carrier_title}
        carrierSignedAt={contract.carrier_signed_at}
        contractorSignatureUrl={isFullyExecuted ? contract.contractor_signature_url : undefined}
        contractorTypedName={isFullyExecuted ? contract.contractor_typed_name ?? undefined : undefined}
        contractorSignedAt={isFullyExecuted ? contract.contractor_signed_at : undefined}
        contractorSigRef={!isFullyExecuted ? sigRef : undefined}
        contractorSignedName={signedName}
        onContractorSignedNameChange={setSignedName}
        onSignatureEnd={() => setHasDrawn(true)}
        onSignatureClear={() => setHasDrawn(false)}
      />

      {!isFullyExecuted && (
        <div className="p-5 bg-secondary/30 border border-border rounded-xl space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            By signing above, I agree to all terms and conditions of the Independent Contractor Agreement with SUPERTRANSPORT, LLC, including all Appendices A through D. I confirm this is a legal electronic signature.
          </p>
          <Button
            onClick={handleSign}
            disabled={signing || !signedName || !hasDrawn}
            className="w-full bg-gold text-surface-dark font-bold hover:bg-gold-light gap-2 h-12"
          >
            {signing ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</> : <><CheckCircle2 className="h-4 w-4" /> Execute Agreement</>}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Please sign in the signature box above and type your full name before executing.
          </p>
        </div>
      )}
    </div>
  );
}
