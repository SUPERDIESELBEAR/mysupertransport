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

async function refreshSignedUrl(rawUrl: string): Promise<string | null> {
  return await resolveDecalUrl(rawUrl);
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
    const dsUrl = decalPhotoDsUrl?.trim();
    const psUrl = decalPhotoPsUrl?.trim();
    if (dsUrl) list.push({ key: 'ds', label: 'Driver Side', rawUrl: dsUrl });
    if (psUrl) list.push({ key: 'ps', label: 'Passenger Side', rawUrl: psUrl });
    decalPhotosExtra.forEach((p, i) => {
      const url = p.url?.trim();
      if (url) list.push({ key: `extra-${i}`, label: p.label || `Additional ${i + 1}`, rawUrl: url });
    });
    return list;
  }, [decalPhotoDsUrl, decalPhotoPsUrl, decalPhotosExtra]);

  const [signed, setSigned] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open || tiles.length === 0) { setSigned({}); setActiveIndex(0); return; }
    let cancelled = false;
    setActiveIndex(0);
    // Seed with raw URLs ONLY when the stored value is already a full URL;
    // bare storage paths (post-normalization) can't be rendered directly and
    // must wait for a fresh signed URL.
    setSigned(
      Object.fromEntries(
        tiles
          .filter(t => /^https?:/i.test(t.rawUrl))
          .map(t => [t.key, t.rawUrl]),
      ),
    );
    (async () => {
      try {
        const entries = await Promise.all(
          tiles.map(async t => [t.key, (await refreshSignedUrl(t.rawUrl)) ?? ''] as const),
        );
        if (!cancelled) setSigned(Object.fromEntries(entries.filter(([, v]) => !!v)));
      } catch (err) {
        console.warn('Decal photo refresh failed; keeping stored URLs.', err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, tiles]);

  useEffect(() => {
    if (activeIndex >= tiles.length) setActiveIndex(Math.max(0, tiles.length - 1));
  }, [activeIndex, tiles.length]);

  const activeTile = tiles[activeIndex] ?? null;
  const activeUrl = activeTile ? (signed[activeTile.key] ?? null) : null;
  const isBarePath = !!activeTile && !/^https?:/i.test(activeTile.rawUrl);
  // Show loading state for a normalized bare path until the signed URL resolves.
  const awaitingSignedUrl = !!activeTile && !activeUrl && isBarePath;

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

  if (open && activeTile && awaitingSignedUrl) {
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Loading decal photo…</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-sm text-muted-foreground">One moment…</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (open && activeTile && !activeUrl) {
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Photo unavailable</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6 opacity-50" />
            The file couldn't be loaded from storage. Please ask the driver to re-upload from Stage 5.
          </div>
        </DialogContent>
      </Dialog>
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