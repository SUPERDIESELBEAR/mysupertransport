import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ImageOff } from 'lucide-react';
import { FilePreviewModal } from '@/components/inspection/DocRow';

// Canonical position order — must match TruckPhotoGridModal / TruckPhotoGuideModal.
const PHOTO_POSITIONS = [
  'Front',
  'Driver Side',
  'Rear',
  'Passenger Side',
  'PS Steer Tire',
  'DS Steer Tire',
  'DS Front Drive Tires',
  'DS Rear Drive Tires',
  'PS Front Drive Tires',
  'PS Rear Drive Tires',
];

interface DocFileRow {
  id: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  driverName: string;
  files: DocFileRow[];
}

type Tile = { key: string; label: string; rawUrl: string };

function extractLabel(fileName: string | null): string {
  if (!fileName) return '';
  const sep = ' — ';
  const idx = fileName.indexOf(sep);
  return idx >= 0 ? fileName.substring(0, idx).trim() : '';
}

export default function TruckPhotoViewerModal({ open, onClose, driverName, files }: Props) {
  const tiles: Tile[] = useMemo(() => {
    // Most recent file per position label.
    const byPosition: Record<string, DocFileRow> = {};
    for (const f of files) {
      const label = extractLabel(f.file_name);
      if (!label || !f.file_url) continue;
      const existing = byPosition[label];
      if (!existing || new Date(f.uploaded_at) > new Date(existing.uploaded_at)) {
        byPosition[label] = f;
      }
    }

    const list: Tile[] = [];
    for (const label of PHOTO_POSITIONS) {
      const f = byPosition[label];
      if (f?.file_url) list.push({ key: label, label, rawUrl: f.file_url });
    }
    // Append unmatched extras at the end.
    for (const f of files) {
      const label = extractLabel(f.file_name);
      if (!f.file_url) continue;
      if (!label || !PHOTO_POSITIONS.includes(label)) {
        list.push({ key: f.id, label: label || f.file_name || 'Additional', rawUrl: f.file_url });
      }
    }
    return list;
  }, [files]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open, tiles.length]);

  if (!open) return null;

  if (tiles.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={onClose}>
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
            {driverName} — Truck Photos
          </span>
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-white/70"
          onClick={(e) => e.stopPropagation()}
        >
          <ImageOff className="h-8 w-8 opacity-60" />
          No truck photos uploaded yet.
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, tiles.length - 1);
  const activeTile = tiles[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < tiles.length - 1;

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