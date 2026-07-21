import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PreviewLink } from '@/components/documents/PreviewLink';
import type { DecalPhotoExtra } from '@/components/staff/StaffDecalPhotoEditor';
import { resolveDecalUrl } from '@/lib/decalUrl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  dsUrl: string | null;
  psUrl: string | null;
  extras: DecalPhotoExtra[];
}

function Tile({ url, label, missing }: { url: string | null; label: string; missing?: boolean }) {
  if (!url) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground">
            {missing ? 'File missing' : 'Not uploaded'}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <PreviewLink url={url} name={`Decal — ${label}`} className="block">
        <img
          src={url}
          alt={`Decal — ${label}`}
          className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity"
        />
      </PreviewLink>
    </div>
  );
}

export default function DecalPhotosQuickView({
  open,
  onOpenChange,
  driverName,
  dsUrl,
  psUrl,
  extras,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [resolvedDs, setResolvedDs] = useState<string | null>(null);
  const [resolvedPs, setResolvedPs] = useState<string | null>(null);
  const [resolvedExtras, setResolvedExtras] = useState<DecalPhotoExtra[]>([]);
  const [dsMissing, setDsMissing] = useState(false);
  const [psMissing, setPsMissing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setResolvedDs(null);
    setResolvedPs(null);
    setResolvedExtras([]);
    setDsMissing(false);
    setPsMissing(false);

    (async () => {
      const [ds, ps, ex] = await Promise.all([
        resolveDecalUrl(dsUrl),
        resolveDecalUrl(psUrl),
        Promise.all(
          extras.map(async (p) => ({ ...p, url: (await resolveDecalUrl(p.url)) ?? '' })),
        ),
      ]);
      if (cancelled) return;
      setResolvedDs(ds);
      setResolvedPs(ps);
      setDsMissing(!!dsUrl && !ds);
      setPsMissing(!!psUrl && !ps);
      setResolvedExtras(ex.filter((p) => p.url));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, dsUrl, psUrl, extras]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Decal Install Photos</DialogTitle>
          <DialogDescription>{driverName}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-3">
          <Tile url={resolvedDs} label="Driver Side" missing={dsMissing} />
          <Tile url={resolvedPs} label="Passenger Side" missing={psMissing} />
        </div>
        {resolvedExtras.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Additional Angles
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {resolvedExtras.map((p, idx) => (
                <div key={idx} className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium truncate">
                    {p.label || `Angle ${idx + 1}`}
                  </p>
                  <PreviewLink url={p.url} name={p.label ?? `Angle ${idx + 1}`} className="block">
                    <img
                      src={p.url}
                      alt={p.label ?? `Angle ${idx + 1}`}
                      className="w-full aspect-video object-cover rounded-lg border border-border hover:opacity-90 transition-opacity"
                    />
                  </PreviewLink>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}