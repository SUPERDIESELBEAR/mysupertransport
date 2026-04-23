import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { X, Loader2, Mail, Download, CheckCircle2 } from 'lucide-react';
import LeaseTerminationDocumentView from './LeaseTerminationDocumentView';
import { printDocumentById, preloadSignatureDataUrl } from '@/lib/printDocument';

const SIGNED_URL_TTL = 3600;

async function toSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const cleanPath = path.includes('/ica-signatures/')
    ? path.split('/ica-signatures/').pop()!
    : path;
  const { data } = await supabase.storage.from('ica-signatures').createSignedUrl(cleanPath, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

interface LeaseTerminationViewModalProps {
  terminationId: string;
  operatorName: string;
  onClose: () => void;
}

export default function LeaseTerminationViewModal({
  terminationId, operatorName, onClose,
}: LeaseTerminationViewModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [carrierSigUrl, setCarrierSigUrl] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('lease_terminations' as any)
      .select('*')
      .eq('id', terminationId)
      .maybeSingle();
    setRecord(data ?? null);
    if (data && (data as any).carrier_signature_url) {
      setCarrierSigUrl(await toSignedUrl((data as any).carrier_signature_url));
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [terminationId]);

  const handleSendInsurance = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-lease-termination', {
        body: { termination_id: terminationId },
      });
      if (error) throw error;
      const sentTo: string[] = data?.sent_to ?? [];
      const cc: string[] = data?.cc ?? [];
      toast({
        title: `Termination sent to ${sentTo.length} recipient${sentTo.length === 1 ? '' : 's'}`,
        description: cc.length ? `CC: ${cc.join(', ')}` : undefined,
      });
      await load();
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handlePrint = async () => {
    if (!record) return;
    setPrinting(true);
    try {
      const carrierB64 = await preloadSignatureDataUrl(record.carrier_signature_url, 'ica-signatures');
      const el = document.getElementById('lease-termination-print-area');
      const imgs = el?.querySelectorAll<HTMLImageElement>('img') ?? [];
      const originals: { img: HTMLImageElement; src: string }[] = [];
      imgs.forEach((img) => {
        if (carrierB64 && img.alt === 'Carrier signature') {
          originals.push({ img, src: img.src });
          img.src = carrierB64;
        }
      });
      printDocumentById('lease-termination-print-area', `Lease Termination - ${operatorName}`);
      originals.forEach(({ img, src }) => { img.src = src; });
    } finally {
      setPrinting(false);
    }
  };

  const alreadySent = !!record?.insurance_notified_at;

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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={printing || loading}
              className="border-gold/50 text-gold hover:bg-gold/10 gap-1.5 text-xs print:hidden"
            >
              <Download className="h-3.5 w-3.5" />
              {printing ? 'Preparing…' : 'Print / PDF'}
            </Button>
            <button onClick={onClose} className="text-surface-dark-muted hover:text-white p-1 transition-colors print:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        {!loading && record && (
          <div className="px-6 py-3 border-b border-border bg-card shrink-0 flex items-center justify-between gap-3 print:hidden">
            <div className="text-xs text-muted-foreground">
              {alreadySent ? (
                <span className="inline-flex items-center gap-1.5 text-status-complete">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sent to insurance {new Date(record.insurance_notified_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {record.insurance_recipients?.length ? ` · ${record.insurance_recipients.length} recipient${record.insurance_recipients.length === 1 ? '' : 's'}` : ''}
                </span>
              ) : (
                <span>Insurance not yet notified</span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSendInsurance}
              disabled={sending}
              className="gap-1.5 bg-gold text-surface-dark hover:bg-gold/90"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {sending ? 'Sending…' : alreadySent ? 'Resend to Insurance' : 'Send to Insurance'}
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" id="lease-termination-print-area">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : !record ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">Termination record not found.</p>
            </div>
          ) : (
            <LeaseTerminationDocumentView
              contractorLabel={record.contractor_label || operatorName}
              truckYear={record.truck_year}
              truckMake={record.truck_make}
              truckModel={record.truck_model}
              truckVin={record.truck_vin}
              truckPlate={record.truck_plate}
              truckPlateState={record.truck_plate_state}
              trailerNumber={record.trailer_number}
              effectiveDate={record.effective_date}
              leaseEffectiveDate={record.lease_effective_date}
              carrierSignatureUrl={carrierSigUrl}
              carrierTypedName={record.carrier_typed_name}
              carrierTitle={record.carrier_title}
              carrierSignedAt={record.carrier_signed_at}
              contractorTypedName={record.contractor_typed_name}
              contractorSignedAt={record.contractor_signed_at}
            />
          )}
        </div>
      </div>
    </div>
  );
}