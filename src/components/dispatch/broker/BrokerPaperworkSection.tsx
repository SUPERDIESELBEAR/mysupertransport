import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage } from '@/lib/dbError';
import {
  brokerDocumentUrl, fetchBrokerDocuments, uploadBrokerDocument, type BrokerDocument,
} from '@/lib/brokerRelationship';

interface Props {
  brokerId: string;
  packetCompleted: boolean;
  onPacketCompletedChange: (v: boolean) => void;
  packetCompletedAt: string | null;
  agreementSigned: boolean;
  onAgreementSignedChange: (v: boolean) => void;
  agreementSignedAt: string | null;
  /** Document row selected as the governing signed agreement. */
  agreementDocumentId: string | null;
  onAgreementDocumentIdChange: (id: string | null) => void;
}

export const brokerDocumentsQueryKey = (id: string) => ['broker-documents', id] as const;

const shortDate = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CATEGORY_LABELS: Record<string, string> = {
  carrier_packet: 'Carrier packet',
  signed_broker_agreement: 'Signed agreement',
};

/**
 * Carrier packet and signed broker-carrier agreement. The agreement is the
 * artifact that governs the relationship, so it lives on the broker record with
 * the file attached rather than in someone's inbox.
 */
export default function BrokerPaperworkSection({
  brokerId, packetCompleted, onPacketCompletedChange, packetCompletedAt,
  agreementSigned, onAgreementSignedChange, agreementSignedAt,
  agreementDocumentId, onAgreementDocumentIdChange,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const packetInput = useRef<HTMLInputElement>(null);
  const agreementInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: docs } = useQuery({
    queryKey: brokerDocumentsQueryKey(brokerId),
    queryFn: () => fetchBrokerDocuments(brokerId),
  });

  const upload = useMutation({
    mutationFn: async (args: { file: File; category: 'carrier_packet' | 'signed_broker_agreement' }) =>
      uploadBrokerDocument(brokerId, args.category, args.file),
    onSuccess: async (doc, args) => {
      await qc.invalidateQueries({ queryKey: brokerDocumentsQueryKey(brokerId) });
      if (args.category === 'signed_broker_agreement') {
        onAgreementDocumentIdChange(doc.id);
        onAgreementSignedChange(true);
      } else {
        onPacketCompletedChange(true);
      }
      toast({ description: `${doc.document_name} attached. Save the broker to record it.` });
    },
    onError: (e: unknown) => toast({
      variant: 'destructive',
      title: 'Upload failed',
      description: getDbErrorMessage(e, 'Could not attach the document.'),
    }),
  });

  const open = async (doc: BrokerDocument) => {
    setBusy(doc.id);
    try {
      const url = await brokerDocumentUrl(doc);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not open document',
        description: getDbErrorMessage(e, 'The file link could not be created.'),
      });
    } finally {
      setBusy(null);
    }
  };

  const rows = docs ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Carrier packet &amp; agreement</p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="broker-packet-completed"
            checked={packetCompleted}
            onCheckedChange={onPacketCompletedChange}
          />
          <Label htmlFor="broker-packet-completed" className="cursor-pointer text-sm">
            Carrier packet completed
            {packetCompleted && shortDate(packetCompletedAt) && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                — {shortDate(packetCompletedAt)}
              </span>
            )}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="broker-agreement-signed"
            checked={agreementSigned}
            onCheckedChange={v => {
              onAgreementSignedChange(v);
              if (!v) onAgreementDocumentIdChange(null);
            }}
          />
          <Label htmlFor="broker-agreement-signed" className="cursor-pointer text-sm">
            Broker-carrier agreement signed
            {agreementSigned && shortDate(agreementSignedAt) && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                — {shortDate(agreementSignedAt)}
              </span>
            )}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Who recorded each of these, and when, is stamped from your sign-in — it is not editable here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={packetInput} type="file" className="hidden"
          accept="application/pdf,image/*"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate({ file, category: 'carrier_packet' });
          }}
        />
        <input
          ref={agreementInput} type="file" className="hidden"
          accept="application/pdf,image/*"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate({ file, category: 'signed_broker_agreement' });
          }}
        />
        <Button
          type="button" size="sm" variant="outline" className="gap-1.5"
          onClick={() => packetInput.current?.click()} disabled={upload.isPending}
        >
          <Upload className="h-3.5 w-3.5" />
          Attach packet
        </Button>
        <Button
          type="button" size="sm" variant="outline" className="gap-1.5"
          onClick={() => agreementInput.current?.click()} disabled={upload.isPending}
        >
          <Upload className="h-3.5 w-3.5" />
          Attach signed agreement
        </Button>
        {upload.isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading…
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map(d => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => void open(d)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm text-foreground underline-offset-2 hover:underline">
                  {d.document_name}
                </span>
                {busy === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </button>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {CATEGORY_LABELS[d.document_category] ?? d.document_category}
                {d.id === agreementDocumentId ? ' · governing' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {agreementSigned && !agreementDocumentId && (
        <p className="text-xs text-warning">
          Marked signed with no agreement attached. Attach the signed document so the governing
          terms are on the record.
        </p>
      )}
    </div>
  );
}
