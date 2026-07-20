import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { useToast } from '@/hooks/use-toast';
import { validateFile, normalizeMobileCaptureFile } from '@/lib/validateFile';
import { Loader2 } from 'lucide-react';

type DocType = 'Registration' | 'Form 2290';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Auth user id of the driver (matches inspection_documents.driver_id). */
  driverUserId: string | null;
  onSaved: () => void;
}

export default function Registration2290Modal({ open, onClose, driverUserId, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState<DocType>('Registration');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setDocType('Registration');
    setEffectiveDate('');
    setExpiresAt('');
    setFile(null);
  };

  const handleSave = async () => {
    if (!driverUserId) {
      toast({ title: 'Missing driver', description: 'Cannot resolve driver account.', variant: 'destructive' });
      return;
    }
    if (!expiresAt) {
      toast({ title: 'Expiration date required', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'File required', description: 'Attach the registration or 2290 file.', variant: 'destructive' });
      return;
    }
    const normalized = normalizeMobileCaptureFile(file);
    const validation = validateFile(normalized);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const ext = normalized.name.split('.').pop()?.toLowerCase() || 'bin';
      const slug = docType === 'Registration' ? 'registration' : 'form-2290';
      const path = `driver/${driverUserId}/${slug}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('inspection-documents')
        .upload(path, normalized, { upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = await supabase.storage
        .from('inspection-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);

      // Replace any existing row for this driver + type so latest = source of truth.
      const { data: existing } = await supabase
        .from('inspection_documents')
        .select('id')
        .eq('scope', 'per_driver')
        .eq('driver_id', driverUserId)
        .eq('name', docType);

      if (existing && existing.length > 0) {
        const { error: updErr } = await supabase
          .from('inspection_documents')
          .update({
            file_url: urlData?.signedUrl ?? null,
            file_path: path,
            expires_at: expiresAt,
            uploaded_by: user?.id ?? null,
            uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            shared_with_fleet: true,
          })
          .eq('id', existing[0].id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('inspection_documents').insert({
          scope: 'per_driver',
          driver_id: driverUserId,
          name: docType,
          file_url: urlData?.signedUrl ?? null,
          file_path: path,
          expires_at: expiresAt,
          uploaded_by: user?.id ?? null,
          shared_with_fleet: true,
        });
        if (insErr) throw insErr;
      }

      toast({ title: `${docType} saved`, description: `Expires ${expiresAt}` });
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Registration / 2290</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs mb-2 block">Document Type *</Label>
            <div className="flex gap-2">
              {(['Registration', 'Form 2290'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={
                    'flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ' +
                    (docType === t
                      ? 'bg-gold/10 border-gold text-foreground'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted/50')
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                {docType === 'Registration' ? 'Effective Date' : 'Tax Period Start'}
              </Label>
              <DateInput
                value={effectiveDate}
                onChange={setEffectiveDate}
                placeholder="MM/DD/YYYY"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Expires *</Label>
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

          <div>
            <Label className="text-xs">Upload File *</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
              className="text-xs h-9"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}