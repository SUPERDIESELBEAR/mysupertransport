import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { updatePayload } from '@/integrations/supabase/helpers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { validateFile, normalizeMobileCaptureFile } from '@/lib/validateFile';
import { Loader2, UploadCloud, FileText, X, RefreshCw, FilePlus2 } from 'lucide-react';

/** Canonical DB name for the truck registration doc — shared with the inspection binder. */
export const REGISTRATION_DOC_NAME = 'IRP Registration (cab card)' as const;
export const REGISTRATION_DOC_LABEL = 'Registration (IRP Cab Card)';

type DocType = typeof REGISTRATION_DOC_NAME | 'Form 2290';

const docLabel = (t: DocType) => (t === REGISTRATION_DOC_NAME ? REGISTRATION_DOC_LABEL : t);
type SaveMode = 'upload' | 'update';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Auth user id of the driver (matches inspection_documents.driver_id). */
  driverUserId: string | null;
  onSaved: () => void;
}

interface ExistingDoc {
  id: string;
  expires_at: string | null;
  uploaded_at: string | null;
}

export default function Registration2290Modal({ open, onClose, driverUserId, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState<DocType>(REGISTRATION_DOC_NAME);
  const [mode, setMode] = useState<SaveMode>('upload');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [existing, setExisting] = useState<ExistingDoc | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const reset = () => {
    setDocType(REGISTRATION_DOC_NAME);
    setMode('upload');
    setEffectiveDate('');
    setExpiresAt('');
    setFile(null);
    setDragging(false);
  };

  // Look up the current document on file for this driver + type
  useEffect(() => {
    if (!open || !driverUserId) { setExisting(null); return; }
    let cancelled = false;
    setLoadingExisting(true);
    (async () => {
      const { data } = await supabase
        .from('inspection_documents')
        .select('id, expires_at, uploaded_at')
        .eq('scope', 'per_driver')
        .eq('driver_id', driverUserId)
        .eq('name', docType)
        .limit(1);
      if (cancelled) return;
      const row = (data && data[0]) || null;
      setExisting(row as ExistingDoc | null);
      setLoadingExisting(false);
      setMode(row ? 'update' : 'upload');
    })();
    return () => { cancelled = true; };
  }, [open, driverUserId, docType]);

  const acceptFile = useCallback((f: File | null) => {
    if (!f) return;
    const normalized = normalizeMobileCaptureFile(f);
    const validation = validateFile(normalized);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }
    setFile(normalized);
  }, [toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const fileRequired = mode === 'upload' || !existing;
  const canSave = !!expiresAt && (!fileRequired || !!file);

  const handleSave = async () => {
    if (!driverUserId) {
      toast({ title: 'Missing driver', description: 'Cannot resolve driver account.', variant: 'destructive' });
      return;
    }
    if (!expiresAt) {
      toast({ title: 'Expiration date required', variant: 'destructive' });
      return;
    }
    if (fileRequired && !file) {
      toast({ title: 'File required', description: 'Attach the registration or 2290 file.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let path: string | null = null;
      let signedUrl: string | null = null;

      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const slug = docType === REGISTRATION_DOC_NAME ? 'registration' : 'form-2290';
        path = `driver/${driverUserId}/${slug}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('inspection-documents')
          .upload(path, file, { upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = await supabase.storage
          .from('inspection-documents')
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        signedUrl = urlData?.signedUrl ?? null;
      }

      if (mode === 'update' && existing) {
        const payload: Record<string, unknown> = {
          expires_at: expiresAt,
          uploaded_by: user?.id ?? null,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          shared_with_fleet: true,
        };
        if (path) {
          payload.file_url = signedUrl;
          payload.file_path = path;
        }
        const { error: updErr } = await supabase
          .from('inspection_documents')
          .update(updatePayload('inspection_documents', payload))
          .eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('inspection_documents').insert({
          scope: 'per_driver',
          driver_id: driverUserId,
          name: docType,
          file_url: signedUrl,
          file_path: path,
          expires_at: expiresAt,
          uploaded_by: user?.id ?? null,
          shared_with_fleet: true,
        });
        if (insErr) throw insErr;
      }

      toast({ title: `${docLabel(docType)} saved`, description: `Expires ${expiresAt}` });
      reset();
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'update' ? 'Update' : 'Add'} Registration / 2290</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs mb-2 block">
              Document Type <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              {([REGISTRATION_DOC_NAME, 'Form 2290'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setDocType(t); setFile(null); }}
                  className={
                    'flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ' +
                    (docType === t
                      ? 'bg-gold/10 border-gold text-foreground'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted/50')
                  }
                >
                  {docLabel(t)}
                </button>
              ))}
            </div>
          </div>

          {/* Upload vs Update toggle */}
          <div>
            <Label className="text-xs mb-2 block">Action <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={
                  'flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors text-left ' +
                  (mode === 'upload'
                    ? 'bg-gold/10 border-gold text-foreground'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted/50')
                }
              >
                <FilePlus2 className="h-3.5 w-3.5 shrink-0" />
                Upload new
              </button>
              <button
                type="button"
                onClick={() => { if (existing) setMode('update'); }}
                disabled={!existing}
                className={
                  'flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ' +
                  (mode === 'update'
                    ? 'bg-gold/10 border-gold text-foreground'
                    : 'bg-background border-border text-muted-foreground enabled:hover:bg-muted/50')
                }
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                Update existing
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {loadingExisting
                ? 'Checking for an existing document…'
                : existing
                  ? mode === 'update'
                    ? `Replaces the current ${docType} on file${existing.expires_at ? ` (expires ${existing.expires_at})` : ''}. File is optional — leave empty to only change the date.`
                    : `A ${docType} is already on file and will be replaced when you save.`
                  : `No ${docType} on file yet — a new record will be created.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                {docType === REGISTRATION_DOC_NAME ? 'Effective Date' : 'Tax Period Start'}
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </Label>
              <DateInput
                value={effectiveDate}
                onChange={setEffectiveDate}
                placeholder="MM/DD/YYYY"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Expires <span className="text-destructive">*</span></Label>
              <DateInput
                value={expiresAt}
                onChange={setExpiresAt}
                placeholder="MM/DD/YYYY"
                className="h-9 text-xs"
              />
            </div>
          </div>
          {docType === 'Form 2290' && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              2290 tax period typically runs July 1 – June 30. Use June 30 of the next year as the expiration.
            </p>
          )}

          {/* Drag & drop upload */}
          <div>
            <Label className="text-xs">
              Document File{' '}
              {fileRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
            </Label>
            <label
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={
                'mt-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ' +
                (dragging ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/50 hover:bg-muted/30')
              }
            >
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
                onChange={e => acceptFile(e.target.files?.[0] ?? null)}
              />
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              <div className="text-xs font-medium text-foreground">
                Drag &amp; drop a file here, or click to browse
              </div>
              <div className="text-[11px] text-muted-foreground">PDF, JPG, PNG, HEIC · max 10 MB</div>
            </label>

            {file && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">{file.name}</div>
                  <div className="text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !canSave} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'update' ? 'Update Document' : 'Upload Document'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
