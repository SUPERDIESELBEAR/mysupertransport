import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Camera, FileText, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { RODS_BUCKET } from '@/lib/eld/rodsTypes';

/**
 * A photo of the day's bill of lading.
 *
 * Supporting evidence only. 49 CFR 395.8(d)(11) wants the shipping document
 * number, or the shipper and commodity, written on the form — a photo does not
 * satisfy that and certify_rods_day's header guard still checks the typed
 * field. This exists so the driver can shoot the paperwork once instead of
 * copying numbers off it, not to replace the entry.
 */
export default function BolPhotoCard({
  operatorId,
  logDate,
  path,
  disabled,
  onChange,
}: {
  operatorId: string;
  logDate: string;
  path: string | null;
  disabled?: boolean;
  onChange: (path: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That photo is over 10 MB. Take it again at a lower quality.');
      return;
    }
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const { data, error } = await uploadToBucket(
      RODS_BUCKET,
      `${operatorId}/${logDate}/bol-${Date.now()}.${ext}`,
      file,
      { contentType: file.type || 'image/jpeg' },
    );
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? 'Could not upload that photo.');
      return;
    }
    onChange(data.path);
    toast.success('Shipping document photo attached.');
  }

  async function open() {
    if (!path) return;
    const { data } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-xs font-semibold text-foreground">Shipping document photo</div>
      <p className="text-[11px] text-muted-foreground">
        Optional. A photo of the BOL is kept with this log, but you still have to write the document number — or the
        shipper and commodity — in the field above.
      </p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {path ? (
          <>
            <Button variant="outline" size="sm" onClick={open}>
              <FileText className="mr-2 h-4 w-4" /> View photo
            </Button>
            {!disabled && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  Retake
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </Button>
              </>
            )}
          </>
        ) : (
          <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Photograph the BOL
          </Button>
        )}
      </div>
    </div>
  );
}
