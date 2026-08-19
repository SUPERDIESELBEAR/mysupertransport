import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { formatEnumLabel } from '@/lib/loadFormat';
import { STOP_TYPE_LABELS, type StopType } from '@/lib/loadRateMath';
import {
  DOCUMENT_TYPE_ORDER, formatFileSize, uploadLoadDocument, validateLoadDocumentFile,
  type LoadDocumentType,
} from '@/lib/loadDocuments';
import type { LoadDetail } from '@/lib/loadDetail';

type FileState = 'queued' | 'uploading' | 'done' | 'error';

interface QueueItem {
  file: File;
  state: FileState;
  error?: string;
}

export default function UploadDocumentsDialog({
  load, open, onOpenChange, initialFiles,
}: {
  load: LoadDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles?: File[];
}) {
  const qc = useQueryClient();
  const [documentType, setDocumentType] = useState<LoadDocumentType>('rate_confirmation');
  const [stopId, setStopId] = useState<string>('none');
  const [notes, setNotes] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>(() => (initialFiles ?? []).map(f => ({ file: f, state: 'queued' as const })));
  const [busy, setBusy] = useState(false);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const next: QueueItem[] = [];
    Array.from(files).forEach(file => {
      const check = validateLoadDocumentFile(file);
      if (!check.valid) {
        toast({ title: 'File not accepted', description: check.error, variant: 'destructive' });
        return;
      }
      next.push({ file, state: 'queued' });
    });
    if (next.length) setQueue(prev => [...prev, ...next]);
  };

  const reset = () => {
    setQueue([]);
    setNotes('');
    setStopId('none');
    setBusy(false);
  };

  const close = (value: boolean) => {
    if (busy) return;
    if (!value) reset();
    onOpenChange(value);
  };

  const handleUpload = async () => {
    const pending = queue.filter(q => q.state !== 'done');
    if (!pending.length) return;
    setBusy(true);

    let succeeded = 0;
    const failures: string[] = [];

    for (const item of pending) {
      setQueue(prev => prev.map(q => (q.file === item.file ? { ...q, state: 'uploading', error: undefined } : q)));
      try {
        await uploadLoadDocument({
          loadId: load.id,
          documentType,
          loadStopId: stopId === 'none' ? null : stopId,
          notes,
          file: item.file,
        });
        succeeded += 1;
        setQueue(prev => prev.map(q => (q.file === item.file ? { ...q, state: 'done' } : q)));
      } catch (err) {
        logDbError('uploadLoadDocument', err, { loadId: load.id, documentType, name: item.file.name });
        const message = getDbErrorMessage(err, 'Upload failed.');
        failures.push(`${item.file.name}: ${message}`);
        setQueue(prev => prev.map(q => (q.file === item.file ? { ...q, state: 'error', error: message } : q)));
      }
    }

    setBusy(false);
    await qc.invalidateQueries({ queryKey: ['load-documents', load.id] });

    if (succeeded) {
      toast({
        title: `${succeeded} document${succeeded === 1 ? '' : 's'} uploaded`,
        description: failures.length ? `${failures.length} file${failures.length === 1 ? '' : 's'} failed and stayed in the list.` : undefined,
      });
    }
    if (failures.length) {
      toast({ title: 'Some uploads failed', description: failures.join(' · '), variant: 'destructive' });
    } else {
      close(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            PDF, JPG, PNG, HEIC, or WebP up to 25 MB each. All files in this batch share the same type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="load-doc-type">Document type</Label>
            <Select value={documentType} onValueChange={v => setDocumentType(v as LoadDocumentType)}>
              <SelectTrigger id="load-doc-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_ORDER.map(t => (
                  <SelectItem key={t} value={t}>{formatEnumLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {load.stops.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="load-doc-stop">Attach to stop (optional)</Label>
              <Select value={stopId} onValueChange={setStopId}>
                <SelectTrigger id="load-doc-stop"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not stop-specific</SelectItem>
                  {load.stops.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {`Stop ${s.stop_sequence ?? '?'} — ${STOP_TYPE_LABELS[s.stop_type as StopType]} · ${s.facility_name || 'Facility TBD'}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="load-doc-files">Files</Label>
            <Input
              id="load-doc-files"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {queue.length ? (
            <ul className="space-y-1.5 rounded-md border border-border p-2">
              {queue.map((item, i) => (
                <li key={`${item.file.name}-${i}`} className="flex items-center gap-2 text-sm">
                  {item.state === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  {item.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-status-complete" /> : null}
                  {item.state === 'error' ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(item.file.size)}</span>
                  {item.state === 'queued' && !busy ? (
                    <Button
                      type="button" variant="ghost" size="icon" className="h-6 w-6"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {queue.some(q => q.state === 'error') ? (
            <p className="text-xs text-destructive">
              {queue.filter(q => q.state === 'error').map(q => q.error).join(' · ')}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="load-doc-notes">Note (optional)</Label>
            <Textarea
              id="load-doc-notes" rows={2} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Context for these documents"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleUpload} disabled={busy || !queue.some(q => q.state !== 'done')}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
