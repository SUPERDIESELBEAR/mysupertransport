import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ImageOff } from 'lucide-react';
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

  const [activeIndex, setActiveIndex] = useState(0);

  // Reset index when the set of tiles changes or the modal reopens.
  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open, tiles.length]);

  if (!open) return null;

  if (tiles.length === 0) {
    // Inline empty-state overlay — same DOM shape as FilePreviewModal so
    // there's no Radix Dialog ↔ inline overlay swap that races history/focus.
    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex flex-col bg-black"
        onClick={onClose}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 bg-surface-dark border-b border-surface-dark-border"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="h-8 px-2 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-medium">Back</span>
          </button>
          <span className="text-sm font-semibold text-surface-dark-foreground truncate">
            {driverName} — Decal Photos
          </span>
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-white/70"
          onClick={(e) => e.stopPropagation()}
        >
          <ImageOff className="h-8 w-8 opacity-60" />
          No decal photos uploaded yet.
        </div>
      </div>,
      document.body
    );
  }

  const safeIndex = Math.min(activeIndex, tiles.length - 1);
  const activeTile = tiles[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < tiles.length - 1;

  // FilePreviewModal's useSignedUrl handles bare storage paths on its own,
  // so pass the raw path directly — no pre-signing render swap.
  return (
    <FilePreviewModal
      url={activeTile.rawUrl}
      name={`${driverName} — ${activeTile.label}`}
      onClose={onClose}
      onPrev={hasPrev ? () => setActiveIndex((i) => Math.max(0, i - 1)) : undefined}
      onNext={hasNext ? () => setActiveIndex((i) => Math.min(tiles.length - 1, i + 1)) : undefined}
      counter={tiles.length > 1 ? `${safeIndex + 1} of ${tiles.length}` : undefined}
    />
  );
}