import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageOff } from 'lucide-react';
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
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open || tiles.length === 0) { setSigned({}); setActiveIndex(0); return; }
    let cancelled = false;
    setActiveIndex(0);
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
      }
    })();
    return () => { cancelled = true; };
  }, [open, tiles]);

  useEffect(() => {
    if (activeIndex >= tiles.length) setActiveIndex(Math.max(0, tiles.length - 1));
  }, [activeIndex, tiles.length]);

  const activeTile = tiles[activeIndex] ?? null;
  const activeUrl = activeTile ? (signed[activeTile.key] ?? activeTile.rawUrl) : null;

  if (open && activeTile && activeUrl) {
    const hasPrev = activeIndex > 0;
    const hasNext = activeIndex < tiles.length - 1;

    return (
      <FilePreviewModal
        key={`${activeTile.key}-${activeUrl}`}
        url={activeUrl}
        name={`${driverName} — ${activeTile.label}`}
        onClose={onClose}
        onPrev={hasPrev ? () => setActiveIndex(i => Math.max(0, i - 1)) : undefined}
        onNext={hasNext ? () => setActiveIndex(i => Math.min(tiles.length - 1, i + 1)) : undefined}
        counter={`${activeIndex + 1} of ${tiles.length}`}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Decal Photos</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <ImageOff className="h-6 w-6 opacity-50" />
          No decal photos uploaded yet.
        </div>
      </DialogContent>
    </Dialog>
  );
}