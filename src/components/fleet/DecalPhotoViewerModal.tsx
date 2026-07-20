import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Loader2, ImageOff } from 'lucide-react';
import { FilePreviewModal } from '@/components/inspection/DocRow';

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

/** Extract storage path from a full operator-documents URL (signed or public). */
function extractStoragePath(fileUrl: string): string {
  const marker = '/operator-documents/';
  const idx = fileUrl.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(fileUrl.substring(idx + marker.length).split('?')[0]);
  }
  return fileUrl.replace(/^\//, '');
}

async function refreshSignedUrl(rawUrl: string): Promise<string> {
  const path = extractStoragePath(rawUrl);
  const { data } = await supabase.storage
    .from('operator-documents')
    .createSignedUrl(path, 3600);
  let url = data?.signedUrl ?? rawUrl;
  if (url.startsWith('/storage/v1/')) {
    const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
    url = `${base}${url}`;
  }
  return url;
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
    if (!open || tiles.length === 0) { setSigned({}); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const entries = await Promise.all(
        tiles.map(async t => [t.key, await refreshSignedUrl(t.rawUrl)] as const),
      );
      if (!cancelled) {
        setSigned(Object.fromEntries(entries));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, tiles]);

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-semibold">Decal Photos</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {driverName} · {tiles.length} photo{tiles.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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