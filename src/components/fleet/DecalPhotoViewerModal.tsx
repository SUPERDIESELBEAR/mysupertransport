import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ImageOff } from 'lucide-react';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { resolveDecalUrl } from '@/lib/decalUrl';

interface DecalExtra {
  url: string;
  label?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  driverName: string;
  decalPhotoDsUrl: string | null;
  decalPhotoPsUrl: string | null;
  decalPhotosExtra: DecalExtra[];
}

async function refreshSignedUrl(rawUrl: string): Promise<string> {
  return (await resolveDecalUrl(rawUrl)) ?? rawUrl;
}

type Tile = { key: string; label: string; rawUrl: string };

export default function DecalPhotoViewerModal({
  open,
  onClose,
  driverName,
  decalPhotoDsUrl,
  decalPhotoPsUrl,
  decalPhotosExtra,
}: Props) {
  const tiles: Tile[] = useMemo(() => {
    const list: Tile[] = [];
    if (decalPhotoDsUrl) list.push({ key: 'ds', label: 'Driver Side', rawUrl: decalPhotoDsUrl });
    if (decalPhotoPsUrl) list.push({ key: 'ps', label: 'Passenger Side', rawUrl: decalPhotoPsUrl });
    decalPhotosExtra.forEach((p, i) =>
      list.push({ key: `extra-${i}`, label: p.label || `Additional ${i + 1}`, rawUrl: p.url }),
    );
    return list;
  }, [decalPhotoDsUrl, decalPhotoPsUrl, decalPhotosExtra]);

  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    console.log('[decals] modal effect', { open, tiles: tiles.length, driverName });
    if (!open || tiles.length === 0) { setSigned({}); return; }
    let cancelled = false;
    setLoading(true);
    // Seed with the raw stored URLs immediately so tiles render even if
    // signed-URL refresh fails or is slow.
    setSigned(Object.fromEntries(tiles.map(t => [t.key, t.rawUrl])));
    (async () => {
      try {
        const entries = await Promise.all(
          tiles.map(async t => [t.key, await refreshSignedUrl(t.rawUrl)] as const),
        );
        if (!cancelled) setSigned(Object.fromEntries(entries));
      } catch (err) {
        console.warn('[decals] refresh failed, keeping raw URLs', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, tiles]);

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="text-base font-semibold">Decal Photos</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {driverName} · {tiles.length} photo{tiles.length === 1 ? '' : 's'}
            </p>
          </DialogHeader>

          <div className="p-5 overflow-y-auto max-h-[70vh]">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
              </div>
            ) : tiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <ImageOff className="h-6 w-6 opacity-50" />
                No decal photos uploaded yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {tiles.map(t => {
                  const url = signed[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => url && setExpanded({ url, name: `${driverName} — ${t.label}` })}
                      className="group flex flex-col gap-1 text-left"
                    >
                      <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted">
                        {url ? (
                          <img
                            src={url}
                            alt={t.label}
                            className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-foreground truncate">{t.label}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {expanded && (
        <FilePreviewModal url={expanded.url} name={expanded.name} onClose={() => setExpanded(null)} />
      )}
    </>
  );
}