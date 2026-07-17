import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PreviewLink } from '@/components/documents/PreviewLink';
import type { DecalPhotoExtra } from '@/components/staff/StaffDecalPhotoEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  dsUrl: string | null;
  psUrl: string | null;
  extras: DecalPhotoExtra[];
}

function Tile({ url, label }: { url: string | null; label: string }) {
  if (!url) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className="w-full aspect-video rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground">Not uploaded</span>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Decal Install Photos</DialogTitle>
          <DialogDescription>{driverName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Tile url={dsUrl} label="Driver Side" />
          <Tile url={psUrl} label="Passenger Side" />
        </div>
        {extras.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Additional Angles
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {extras.map((p, idx) => (
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
      </DialogContent>
    </Dialog>
  );
}