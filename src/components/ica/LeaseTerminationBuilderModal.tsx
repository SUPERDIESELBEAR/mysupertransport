import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Loader2, FileSignature, AlertTriangle } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import LeaseTerminationDocumentView from './LeaseTerminationDocumentView';

const SIGNED_URL_TTL = 3600;

async function toSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const bucket = path.includes('/ica-signatures/') || path.startsWith('carrier-default/')
    ? 'ica-signatures' : 'ica-signatures';
  const cleanPath = path.includes('/ica-signatures/')
    ? path.split('/ica-signatures/').pop()!
    : path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

interface LeaseTerminationBuilderModalProps {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
  onCreated: (terminationId: string) => void;
}

type ReasonValue = 'voluntary' | 'mutual' | 'cause';

export default function LeaseTerminationBuilderModal({
  operatorId, operatorName, onClose, onCreated,
}: LeaseTerminationBuilderModalProps) {
  const { session } = useAuth();
  const { guardDemo } = useDemoMode();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ica, setIca] = useState<any>(null);
  const [carrierSettings, setCarrierSettings] = useState<{
    typed_name: string; title: string; signature_url: string | null;
  } | null>(null);
  const [carrierSigPreview, setCarrierSigPreview] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [effectiveDate, setEffectiveDate] = useState<string>(today);
  const [reason, setReason] = useState<ReasonValue>('voluntary');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [icaRes, settingsRes] = await Promise.all([
        supabase.from('ica_contracts' as any)
          .select('*')
          .eq('operator_id', operatorId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('carrier_signature_settings' as any).select('*').maybeSingle(),
      ]);
      setIca(icaRes.data ?? null);
      const settings = settingsRes.data as any;
      if (settings) {
        setCarrierSettings({
          typed_name: settings.typed_name,
          title: settings.title,
          signature_url: settings.signature_url,
        });
        if (settings.signature_url) {
          setCarrierSigPreview(await toSignedUrl(settings.signature_url));
        }
      }
      setLoading(false);
    })();
  }, [operatorId]);

  const contractorLabel: string = (() => {
    if (!ica) return operatorName;
    if (ica.owner_name && ica.owner_business_name) {
      return `${ica.owner_name} d/b/a ${ica.owner_business_name}`;
    }
    return ica.owner_business_name || ica.owner_name || operatorName;
  })();

  const canSign = !!carrierSettings?.signature_url && !!effectiveDate;

  const handleSign = async () => {
    if (guardDemo()) return;
    if (!canSign) return;
    if (!session?.user?.id) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        operator_id: operatorId,
        ica_contract_id: ica?.id ?? null,
        effective_date: effectiveDate,
        reason,
        notes: notes.trim() || null,
        truck_year: ica?.truck_year ?? null,
        truck_make: ica?.truck_make ?? null,
        truck_model: ica?.truck_model ?? null,
        truck_vin: ica?.truck_vin ?? null,
        truck_plate: ica?.truck_plate ?? null,
        truck_plate_state: ica?.truck_plate_state ?? null,
        trailer_number: ica?.trailer_number ?? null,
        contractor_label: contractorLabel,
        lease_effective_date: ica?.lease_effective_date ?? null,
        carrier_signed_by: session.user.id,
        carrier_typed_name: carrierSettings!.typed_name,
        carrier_title: carrierSettings!.title,
        carrier_signature_url: carrierSettings!.signature_url,
        carrier_signed_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('lease_terminations' as any)
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;

      // Audit log
      await supabase.from('audit_log').insert({
        actor_id: session.user.id,
        entity_type: 'operator',
        entity_id: operatorId,
        entity_label: operatorName,
        action: 'lease_termination_signed',
        metadata: {
          termination_id: (data as any).id,
          effective_date: effectiveDate,
          reason,
          truck_vin: ica?.truck_vin ?? null,
        },
      });

      toast({ title: 'Lease termination signed', description: 'Appendix C is saved and ready to send.' });
      onCreated((data as any).id);
    } catch (err: any) {
      toast({ title: 'Sign failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-full bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Lease Termination — Appendix C</h2>
            <p className="text-sm text-surface-dark-muted">{operatorName}</p>
          </div>
          <button onClick={onClose} className="text-surface-dark-muted hover:text-white p-1 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary */}
              <div className="border border-border rounded-xl p-4 bg-card space-y-2 text-sm">
                <Row label="Driver" value={operatorName} />
                <Row label="Truck" value={[ica?.truck_year, ica?.truck_make, ica?.truck_model].filter(Boolean).join(' ') || '—'} />
                <Row label="VIN" value={ica?.truck_vin || '—'} mono />
                <Row label="Original ICA" value={ica?.lease_effective_date ? `Effective ${new Date(ica.lease_effective_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No ICA on file'} />
              </div>

              {/* Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Effective Termination Date
                  </Label>
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Reason (internal — not on document)
                  </Label>
                  <Select value={reason} onValueChange={(v) => setReason(v as ReasonValue)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voluntary">Voluntary separation</SelectItem>
                      <SelectItem value="mutual">Mutual release</SelectItem>
                      <SelectItem value="cause">For cause</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notes for insurance (optional)
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. equipment retrieved, decals removed…"
                  className="text-sm min-h-[72px] resize-none"
                />
              </div>

              {/* Carrier signature status */}
              <div className="border border-border rounded-xl p-4 bg-card">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Carrier Signature
                </p>
                {carrierSettings?.signature_url ? (
                  <div className="flex items-center gap-3">
                    {carrierSigPreview && (
                      <div className="border border-border rounded bg-white p-2">
                        <img src={carrierSigPreview} alt="Carrier signature" className="h-12 w-auto" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-foreground">{carrierSettings.typed_name}</p>
                      <p className="text-xs text-muted-foreground">{carrierSettings.title}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">No carrier signature on file</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Save your default carrier signature in Settings → Carrier Signature first.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Preview</p>
                <LeaseTerminationDocumentView
                  contractorLabel={contractorLabel}
                  truckYear={ica?.truck_year}
                  truckMake={ica?.truck_make}
                  truckModel={ica?.truck_model}
                  truckVin={ica?.truck_vin}
                  truckPlate={ica?.truck_plate}
                  truckPlateState={ica?.truck_plate_state}
                  trailerNumber={ica?.trailer_number}
                  effectiveDate={effectiveDate}
                  leaseEffectiveDate={ica?.lease_effective_date}
                  carrierSignatureUrl={carrierSigPreview}
                  carrierTypedName={carrierSettings?.typed_name}
                  carrierTitle={carrierSettings?.title}
                  carrierSignedAt={null}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-card shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSign}
            disabled={!canSign || saving}
            className="gap-1.5 bg-gold text-surface-dark hover:bg-gold/90"
          >
            <DemoLockIcon />
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            {saving ? 'Signing…' : 'Sign & Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-baseline">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}