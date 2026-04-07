import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ICADocumentView from './ICADocumentView';
import { printDocumentById, preloadSignatureDataUrl } from '@/lib/printDocument';
const SIGNED_URL_TTL = 3600; // 1 hour

async function toSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Already a full URL (legacy records stored publicUrl) — return as-is
  if (path.startsWith('http')) return path;
  const { data } = await supabase.storage
    .from('ica-signatures')
    .createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

interface ICAViewModalProps {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
}

export default function ICAViewModal({ operatorId, operatorName, onClose }: ICAViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('ica_contracts' as any)
        .select('*')
        .eq('operator_id', operatorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        // Resolve signed URLs for private-bucket signature images
        const rawData = data as Record<string, any>;
        const [carrierUrl, contractorUrl] = await Promise.all([
          toSignedUrl(rawData.carrier_signature_url),
          toSignedUrl(rawData.contractor_signature_url),
        ]);
        setContract({
          ...rawData,
          carrier_signature_url: carrierUrl,
          contractor_signature_url: contractorUrl,
        });
      } else {
        setContract(null);
      }
      setLoading(false);
    };
    fetch();
  }, [operatorId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-full bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Executed ICA Agreement</h2>
            <p className="text-sm text-surface-dark-muted">{operatorName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="border-gold/50 text-gold hover:bg-gold/10 gap-1.5 text-xs print:hidden"
            >
              <Download className="h-3.5 w-3.5" />
              Print / Download
            </Button>
            <button onClick={onClose} className="text-surface-dark-muted hover:text-white p-1 transition-colors print:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" id="ica-print-area">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : !contract ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No executed ICA found for this operator.</p>
            </div>
          ) : (
            <>
              {/* Execution Status Banner */}
              <div className="mb-6 p-4 rounded-xl border border-status-complete/30 bg-status-complete/5 flex items-center gap-4">
                <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Carrier Signed</p>
                    <p className="font-semibold text-foreground">{contract.carrier_typed_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{contract.carrier_title || ''}</p>
                    {contract.carrier_signed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(contract.carrier_signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Contractor Signed</p>
                    <p className="font-semibold text-foreground">{contract.contractor_typed_name || '—'}</p>
                    {contract.contractor_signed_at ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(contract.contractor_signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    ) : (
                      <p className="text-xs text-status-action font-medium mt-0.5">Awaiting contractor signature</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Signature side-by-side preview */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="border border-border rounded-xl p-4 bg-white space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Carrier Signature</p>
                  {contract.carrier_signature_url ? (
                    <img
                      src={contract.carrier_signature_url}
                      alt="Carrier signature"
                      className="h-20 w-auto max-w-full object-contain"
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center border border-dashed border-border rounded-lg">
                      <span className="text-xs text-muted-foreground">No signature on file</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 space-y-0.5">
                    <p className="text-xs font-medium text-foreground">{contract.carrier_typed_name}</p>
                    <p className="text-xs text-muted-foreground">{contract.carrier_title}</p>
                    <p className="text-xs text-muted-foreground">SUPERTRANSPORT, LLC</p>
                  </div>
                </div>

                <div className="border border-border rounded-xl p-4 bg-white space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contractor Signature</p>
                  {contract.contractor_signature_url ? (
                    <img
                      src={contract.contractor_signature_url}
                      alt="Contractor signature"
                      className="h-20 w-auto max-w-full object-contain"
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center border border-dashed border-border rounded-lg">
                      <span className="text-xs text-status-action">Awaiting signature</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 space-y-0.5">
                    <p className="text-xs font-medium text-foreground">{contract.contractor_typed_name || operatorName}</p>
                    <p className="text-xs text-muted-foreground">Independent Contractor</p>
                  </div>
                </div>
              </div>

              {/* Full ICA document */}
              <ICADocumentView
                data={{
                  truck_year: contract.truck_year ?? '',
                  truck_make: contract.truck_make ?? '',
                  truck_model: contract.truck_model ?? '',
                  truck_vin: contract.truck_vin ?? '',
                  truck_plate: contract.truck_plate ?? '',
                  truck_plate_state: contract.truck_plate_state ?? '',
                  trailer_number: contract.trailer_number ?? '',
                  owner_name: (contract as any).owner_name ?? '',
                  owner_business_name: contract.owner_business_name ?? '',
                  owner_ein: (contract as any).owner_ein ?? '',
                  owner_ssn: (contract as any).owner_ssn ?? '',
                  owner_address: contract.owner_address ?? '',
                  owner_city: contract.owner_city ?? '',
                  owner_state: contract.owner_state ?? '',
                  owner_zip: contract.owner_zip ?? '',
                  owner_phone: contract.owner_phone ?? '',
                  owner_email: contract.owner_email ?? '',
                  linehaul_split_pct: contract.linehaul_split_pct ?? 72,
                  lease_effective_date: contract.lease_effective_date ?? '',
                  lease_termination_date: contract.lease_termination_date ?? '',
                }}
                operatorName={operatorName}
                previewMode
                carrierSignatureUrl={contract.carrier_signature_url}
                carrierTypedName={contract.carrier_typed_name}
                carrierTitle={contract.carrier_title}
                carrierSignedAt={contract.carrier_signed_at}
                contractorSignatureUrl={contract.contractor_signature_url}
                contractorTypedName={contract.contractor_typed_name}
                contractorSignedAt={contract.contractor_signed_at}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
