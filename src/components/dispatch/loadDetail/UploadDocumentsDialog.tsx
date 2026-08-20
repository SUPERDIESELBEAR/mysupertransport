import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Trash2, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { formatEnumLabel } from '@/lib/loadFormat';
import { STOP_TYPE_LABELS, type StopType } from '@/lib/loadRateMath';
import {
  DOCUMENT_TYPE_ORDER, LOADOUT_PHOTO_TYPES, PHOTO_LABEL_SUGGESTIONS,
  formatFileSize, uploadLoadDocument, validateLoadDocumentFile, validateLoadoutPhotoFile,
  type LoadDocumentType,
} from '@/lib/loadDocuments';
import type { LoadDetail } from '@/lib/loadDetail';

type FileState = 'queued' | 'uploading' | 'done' | 'error';

interface QueueItem {
  file: File;
  state: FileState;
  error?: string;
  photoLabel: string;
  damageNoted: boolean;
  damageNotes: string;
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
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    (initialFiles ?? []).map(f => makeItem(f)),
  );
  const [busy, setBusy] = useState(false);

  const isPhotoMode = LOADOUT_PHOTO_TYPES.includes(documentType);

  const availableTypes = useMemo<LoadDocumentType[]>(() => {
    if (load.load_type === 'loadout') {
      return [...DOCUMENT_TYPE_ORDER, ...LOADOUT_PHOTO_TYPES];
    }
    return DOCUMENT_TYPE_ORDER;
  }, [load.load_type]);

  function makeItem(file: File): QueueItem {
    return {
      file,
      state: 'queued',
      photoLabel: '',
      damageNoted: false,
      damageNotes: '',
    };
  }

  function validate(file: File): { valid: boolean; error?: string } {
    if (isPhotoMode) return validateLoadoutPhotoFile(file);
    return validateLoadDocumentFile(file);
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const next: QueueItem[] = [];
    Array.from(files).forEach(file => {
      const check = validate(file);
      if (!check.valid) {
        toast({ title: 'File not accepted', description: check.error, variant: 'destructive' });
        return;
      }
      next.push(makeItem(file));
    });
    if (next.length) setQueue(prev => [...prev, ...next]);
  }

  function reset() {
    setQueue([]);
    setNotes('');
    setStopId('none');
    setBusy(false);
  }

  function close(value: boolean) {
    if (busy) return;
    if (!value) reset();
    onOpenChange(value);
  }

  function updateItem(index: number, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function moveItem(index: number, delta: number) {
    setQueue(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(index: number) {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    const pending = queue.filter(q => q.state !== 'done');
    if (!pending.length) return;
    setBusy(true);

    let succeeded = 0;
    const failures: string[] = [];

    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i];
      setQueue(prev => prev.map(q => (q.file === item.file ? { ...q, state: 'uploading', error: undefined } : q)));
      try {
        await uploadLoadDocument({
          loadId: load.id,
          documentType,
          loadStopId: stopId === 'none' ? null : stopId,
          notes,
          file: item.file,
          photoLabel: isPhotoMode ? item.photoLabel || null : null,
          photoSequence: isPhotoMode ? i + 1 : null,
          damageNoted: isPhotoMode ? item.damageNoted : null,
          damageNotes: isPhotoMode && item.damageNoted ? item.damageNotes : null,
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
  }

  const hasPending = queue.some(q => q.state !== 'done');
  const hasError = queue.some(q => q.state === 'error');
  const canUpload = hasPending && !busy;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            {isPhotoMode
              ? 'Inspection photos must be JPG, PNG, HEIC, or WebP, up to 25 MB each.'
              : 'PDF, JPG, PNG, HEIC, or WebP up to 25 MB each. All files in this batch share the same type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="load-doc-type">Document type</Label>
            <Select value={documentType} onValueChange={v => setDocumentType(v as LoadDocumentType)}>
              <SelectTrigger id="load-doc-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableTypes.map(t => (
                  <SelectItem key={t} value={t}>{formatEnumLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isPhotoMode && load.stops.length ? (
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
              accept={isPhotoMode ? '.jpg,.jpeg,.png,.heic,.heif,.webp' : '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp'}
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {queue.length ? (
            <ul className="space-y-2 rounded-md border border-border p-2">
              {queue.map((item, i) => (
                <li key={`${item.file.name}-${i}`} className="rounded-md border border-border bg-background p-2 text-sm">
                  <div className="flex items-center gap-2">
                    {item.state === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    {item.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-status-complete" /> : null}
                    {item.state === 'error' ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(item.file.size)}</span>
                    {item.state === 'queued' && !busy ? (
                      <Button
                        type="button" variant="ghost" size="icon" className="h-6 w-6"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>

                  {isPhotoMode && item.state !== 'done' ? (
                    <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`photo-label-${i}`} className="sr-only">Photo label</Label>
                        <Input
                          id={`photo-label-${i}`}
                          list="photo-label-suggestions"
                          placeholder="Photo label"
                          value={item.photoLabel}
                          onChange={e => updateItem(i, { photoLabel: e.target.value })}
                          className="h-8 text-sm"
                        />
                        <datalist id="photo-label-suggestions">
                          {PHOTO_LABEL_SUGGESTIONS.map(label => (
                            <option key={label} value={label} />
                          ))}
                        </datalist>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7"
                            aria-label={`Move ${item.file.name} earlier`}
                            disabled={i === 0 || busy}
                            onClick={() => moveItem(i, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7"
                            aria-label={`Move ${item.file.name} later`}
                            disabled={i === queue.length - 1 || busy}
                            onClick={() => moveItem(i, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`damage-${i}`}
                          checked={item.damageNoted}
                          onCheckedChange={v => updateItem(i, { damageNoted: v === true })}
                          disabled={busy}
                        />
                        <Label htmlFor={`damage-${i}`} className="text-xs font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Damage noted
                        </Label>
                      </div>

                      {item.damageNoted ? (
                        <Textarea
                          placeholder="Describe the damage"
                          rows={2}
                          value={item.damageNotes}
                          onChange={e => updateItem(i, { damageNotes: e.target.value })}
                          disabled={busy}
                          className="text-xs"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {item.state === 'error' && item.error ? (
                    <p className="mt-1 text-xs text-destructive">{item.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {!isPhotoMode ? (
            <div className="space-y-1.5">
              <Label htmlFor="load-doc-notes">Note (optional)</Label>
              <Textarea
                id="load-doc-notes" rows={2} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Context for these documents"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!canUpload}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
