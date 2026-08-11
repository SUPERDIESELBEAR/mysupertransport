import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { updatePayload } from '@/integrations/supabase/helpers';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { validateFile } from '@/lib/validateFile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, Plus, Trash2 } from 'lucide-react';
import { PreviewLink } from '@/components/documents/PreviewLink';
import { resolveDecalUrl } from '@/lib/decalUrl';

/**
 * Decal photos are stored as bare private-bucket paths. Resolve each stored
 * value into a fresh signed URL before rendering, otherwise the <img> points
 * at a non-URL and shows a broken image.
 */
function useResolvedDecalUrls(stored: string[]) {
  const key = stored.join('|');
  const [resolved, setResolved] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split('|').filter(Boolean) : [];
    if (list.length === 0) { setResolved({}); return; }
    (async () => {
      const entries = await Promise.all(
        list.map(async (u) => [u, await resolveDecalUrl(u)] as const),
      );
      if (!cancelled) setResolved(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [key]);

  return resolved;
}

function PhotoTile({
  stored, resolved, name, alt,
}: { stored: string; resolved: Record<string, string | null>; name: string; alt: string }) {
  const pending = !(stored in resolved);
  const url = resolved[stored] ?? null;

  if (pending) {
    return (
      <div className="w-full aspect-video rounded-lg border border-border bg-muted/40 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-full aspect-video rounded-lg border border-dashed border-destructive/40 bg-muted/40 flex items-center justify-center">
        <span className="text-[11px] text-muted-foreground">Photo unavailable</span>
      </div>
    );
  }
  return (
    <PreviewLink url={url} name={name} className="block">
      <img src={url} alt={alt} className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
    </PreviewLink>
  );
}

export interface DecalPhotoExtra {
  url: string;
  label?: string;
  uploaded_at?: string;
  uploaded_by?: string;
}

interface Props {
  operatorId: string;
  decalPhotoDsUrl: string | null;
  decalPhotoPsUrl: string | null;
  decalPhotosExtra: DecalPhotoExtra[];
  onChange: (next: {
    decal_photo_ds_url?: string | null;
    decal_photo_ps_url?: string | null;
    decal_photos?: DecalPhotoExtra[];
  }) => void;
}

async function uploadDecalFile(operatorId: string, slot: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${operatorId}/decal_photos/${slot}_${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('operator-documents')
    .upload(path, file, { upsert: false });
  if (uploadErr) throw uploadErr;
  // Store the bare storage path — viewers mint a fresh signed URL on read
  // so links never expire.
  return path;
}

export default function StaffDecalPhotoEditor({
  operatorId,
  decalPhotoDsUrl,
  decalPhotoPsUrl,
  decalPhotosExtra,
  onChange,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const dsRef = useRef<HTMLInputElement | null>(null);
  const psRef = useRef<HTMLInputElement | null>(null);
  const extraRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const storedUrls = useMemo(
    () => [decalPhotoDsUrl, decalPhotoPsUrl, ...decalPhotosExtra.map(p => p.url)].filter(Boolean) as string[],
    [decalPhotoDsUrl, decalPhotoPsUrl, decalPhotosExtra],
  );
  const resolved = useResolvedDecalUrls(storedUrls);

  const persistOnboarding = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from('onboarding_status').update(updatePayload('onboarding_status', patch)).eq('operator_id', operatorId);
    if (error) throw error;
  };

  const handleSide = async (side: 'ds' | 'ps', file: File) => {
    const { valid, error } = validateFile(file, false);
    if (!valid) {
      toast({ title: 'Invalid file', description: error, variant: 'destructive' });
      return;
    }
    const key = `decal_photo_${side}`;
    setUploading(key);
    try {
      const url = await uploadDecalFile(operatorId, side, file);
      const column = side === 'ds' ? 'decal_photo_ds_url' : 'decal_photo_ps_url';
      await persistOnboarding({ [column]: url });
      onChange({ [column]: url });
      toast({ title: 'Photo uploaded' });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleAddExtra = async (file: File) => {
    const { valid, error } = validateFile(file, false);
    if (!valid) {
      toast({ title: 'Invalid file', description: error, variant: 'destructive' });
      return;
    }
    setUploading('extra');
    try {
      const url = await uploadDecalFile(operatorId, `extra_${decalPhotosExtra.length + 1}`, file);
      const next = [
        ...decalPhotosExtra,
        { url, label: `Angle ${decalPhotosExtra.length + 1}`, uploaded_at: new Date().toISOString(), uploaded_by: user?.id },
      ];
      await persistOnboarding({ decal_photos: next });
      onChange({ decal_photos: next });
      toast({ title: 'Angle added' });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveExtra = async (idx: number) => {
    const next = decalPhotosExtra.filter((_, i) => i !== idx);
    try {
      await persistOnboarding({ decal_photos: next });
      onChange({ decal_photos: next });
    } catch (err: unknown) {
      toast({ title: 'Remove failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleRelabelExtra = async (idx: number, label: string) => {
    const next = decalPhotosExtra.map((p, i) => (i === idx ? { ...p, label } : p));
    onChange({ decal_photos: next });
    try {
      await persistOnboarding({ decal_photos: next });
    } catch {/* loud failure handled elsewhere */}
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decal Install Photos</p>
      <div className="grid grid-cols-2 gap-3">
        {(['ds', 'ps'] as const).map(side => {
          const url = side === 'ds' ? decalPhotoDsUrl : decalPhotoPsUrl;
          const label = side === 'ds' ? 'Driver Side' : 'Passenger Side';
          const ref = side === 'ds' ? dsRef : psRef;
          const upKey = `decal_photo_${side}`;
          return (
            <div key={side} className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              {url ? (
                <PhotoTile stored={url} resolved={resolved} name={`Decal — ${label}`} alt={`Decal — ${label}`} />
              ) : (
                <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center">
                  <span className="text-[11px] text-muted-foreground">No photo yet</span>
                </div>
              )}
              <input
                ref={ref}
                type="file"
                accept=".jpg,.jpeg,.png,.heic"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleSide(side, f);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs gap-1.5"
                disabled={uploading === upKey}
                onClick={() => ref.current?.click()}
              >
                {uploading === upKey
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3 w-3" /> {url ? 'Replace' : 'Upload'}</>}
              </Button>
            </div>
          );
        })}
      </div>

      {decalPhotosExtra.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          {decalPhotosExtra.map((p, idx) => (
            <div key={idx} className="space-y-1.5">
              <Input
                value={p.label ?? ''}
                onChange={e => handleRelabelExtra(idx, e.target.value)}
                placeholder={`Angle ${idx + 1}`}
                className="h-7 text-[11px]"
              />
              <PhotoTile
                stored={p.url}
                resolved={resolved}
                name={p.label ?? `Angle ${idx + 1}`}
                alt={p.label ?? `Angle ${idx + 1}`}
              />
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 text-[11px] gap-1.5 text-destructive hover:text-destructive"
                onClick={() => handleRemoveExtra(idx)}
              >
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={extraRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleAddExtra(f);
          e.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="text-xs gap-1.5 h-7 mt-1"
        disabled={uploading === 'extra'}
        onClick={() => extraRef.current?.click()}
      >
        {uploading === 'extra'
          ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
          : <><Plus className="h-3 w-3" /> Add Angle</>}
      </Button>
    </div>
  );
}