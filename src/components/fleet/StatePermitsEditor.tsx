import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import {
  PERMIT_STATES,
  PERMIT_STATE_META,
  emptyPermit,
  type PermitStateCode,
  type StatePermit,
} from '@/lib/statePermits';

interface StatePermitsEditorProps {
  permits: StatePermit[];
  onChange: (permits: StatePermit[]) => void;
  /** Driver auth user id — required to file an uploaded permit in the roadside binder. */
  driverUserId: string | null;
  uploaderId: string | null;
}

export default function StatePermitsEditor({ permits, onChange, driverUserId, uploaderId }: StatePermitsEditorProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<PermitStateCode | null>(null);
  const [docNames, setDocNames] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const get = (code: PermitStateCode): StatePermit =>
    permits.find(p => p.stateCode === code) ?? emptyPermit(code);

  const patch = (code: PermitStateCode, changes: Partial<StatePermit>) => {
    const next = PERMIT_STATES.map(c => (c === code ? { ...get(c), ...changes } : get(c)));
    onChange(next);
  };

  const handleUpload = async (code: PermitStateCode, file: File) => {
    if (!driverUserId) {
      toast({
        title: 'No driver account linked',
        description: 'This truck has no driver login yet, so the permit file cannot be filed in the binder.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(code);
    try {
      const docName = `${PERMIT_STATE_META[code].permitLabel}`;
      const ext = file.name.split('.').pop();
      const path = `driver/${driverUserId}/state-permit-${code.toLowerCase()}/${Date.now()}.${ext}`;
      const { error: storageErr } = await uploadToBucket('inspection-documents', path, file, { upsert: false });
      if (storageErr) throw storageErr;
      const { data: urlData } = await supabase.storage
        .from('inspection-documents')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);

      const { data: inserted, error: dbErr } = await supabase
        .from('inspection_documents')
        .insert({
          name: docName,
          scope: 'per_driver',
          driver_id: driverUserId,
          file_url: urlData?.signedUrl ?? null,
          file_path: path,
          uploaded_by: uploaderId,
          expires_at: get(code).expiresAt,
        })
        .select('id')
        .single();
      if (dbErr) {
        await supabase.storage.from('inspection-documents').remove([path]).catch(() => {});
        throw dbErr;
      }
      patch(code, { documentId: inserted.id });
      setDocNames(prev => ({ ...prev, [code]: file.name }));
      toast({ title: 'Permit uploaded', description: `${docName} filed in the roadside binder.` });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div>
        <Label className="text-xs font-semibold">State Permits</Label>
        <p className="text-[11px] text-muted-foreground">
          States requiring permits beyond standard IFTA. All optional — turning one on never blocks onboarding.
        </p>
      </div>

      {PERMIT_STATES.map(code => {
        const permit = get(code);
        const meta = PERMIT_STATE_META[code];
        return (
          <div key={code} className="rounded-md border border-border px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {code} <span className="text-muted-foreground font-normal">— {meta.name}</span>
                </div>
              </div>
              <Switch
                checked={permit.registered}
                onCheckedChange={v => patch(code, { registered: v })}
                aria-label={`Registered in ${meta.name}`}
              />
            </div>

            {permit.registered && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{meta.permitLabel}</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={permit.permitNumber ?? ''}
                      onChange={e => patch(code, { permitNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Expires</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={permit.expiresAt ?? ''}
                      onChange={e => patch(code, { expiresAt: e.target.value || null })}
                    />
                  </div>
                </div>

                <input
                  ref={el => { inputRefs.current[code] = el; }}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUpload(code, file);
                  }}
                />
                {permit.documentId ? (
                  <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-foreground truncate">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      {docNames[code] ?? 'Permit document attached'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5"
                      onClick={() => patch(code, { documentId: null })}
                      title="Unlink this document from the permit"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-[11px]"
                    disabled={uploading === code}
                    onClick={() => inputRefs.current[code]?.click()}
                  >
                    {uploading === code
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Upload className="h-3 w-3" />}
                    Upload permit (optional)
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}