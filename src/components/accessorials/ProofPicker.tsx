import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  fetchLoadDocuments, uploadLoadDocument, validateLoadDocumentFile,
  type LoadDocumentType,
} from '@/lib/loadDocuments';
import { PROOF_KIND_LABELS, type ProofKind } from '@/lib/accessorialAdjustments';

/**
 * ATTACHING THE BACKUP DOCUMENT WITHOUT LEAVING THE DIALOG.
 *
 * The moment the paperwork is in hand is the moment the adjustment is being
 * recorded, so the file goes up from here. There is NO second document store:
 * the upload is the ordinary load-document path, and the adjustment only ever
 * points at the row that path creates.
 */

/** Which load document slot the file lands in, by charge type first. */
function slotFor(chargeType: string, proofKind: ProofKind): LoadDocumentType {
  switch ((chargeType || '').toLowerCase()) {
    case 'detention': return 'detention_documentation';
    case 'lumper': return 'lumper_receipt';
    case 'reimbursement': return 'reimbursement_proof';
    default:
      return proofKind === 'broker_agreement' ? 'broker_correspondence' : 'other';
  }
}

export default function ProofPicker({
  loadId, chargeType, proofKind, value, onChange, disabled,
}: {
  loadId: string;
  chargeType: string;
  proofKind: ProofKind;
  value: string;
  onChange: (documentId: string) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: documents, refetch } = useQuery({
    queryKey: ['load-documents', loadId],
    queryFn: () => fetchLoadDocuments(loadId),
    enabled: !!loadId,
  });

  const pick = async (file: File) => {
    const check = validateLoadDocumentFile(file);
    if (!check.valid) {
      toast({ title: 'That file cannot be used', description: check.error, variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const id = await uploadLoadDocument({
        loadId,
        documentType: slotFor(chargeType, proofKind),
        file,
        notes: 'Backup documentation for a late accessorial',
      });
      await refetch();
      onChange(id);
      toast({ title: 'Attached', description: `${file.name} is now on the load.` });
    } catch (e) {
      toast({
        title: 'Could not attach it',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const list = documents ?? [];

  return (
    <div className="space-y-1.5">
      <Label>Backup documentation</Label>
      <div className="flex gap-2">
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger data-testid="adjustment-proof" className="flex-1">
            <SelectValue placeholder="Not attached yet" />
          </SelectTrigger>
          <SelectContent>
            {list.length === 0 ? (
              <SelectItem value="__none" disabled>No documents on this load yet</SelectItem>
            ) : list.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.document_name || 'Document'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          data-testid="adjustment-proof-upload"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <Paperclip className="h-4 w-4" />}
          <span className="ml-1">{uploading ? 'Uploading…' : 'Upload'}</span>
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); }}
      />
      <p className="text-[11px] text-muted-foreground" data-testid="adjustment-proof-hint">
        {PROOF_KIND_LABELS[proofKind]} is what this charge needs. Upload it here or pick a file
        already on the load — either way it is filed on the load itself.
      </p>
    </div>
  );
}
