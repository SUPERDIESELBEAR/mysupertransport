import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/loadDetail';
import { createDocumentSignedUrl, type LoadDocument } from '@/lib/loadDocuments';
import DocumentThumbnail from './DocumentThumbnail';

function sortPhotos(photos: LoadDocument[]): LoadDocument[] {
  return [...photos].sort((a, b) => {
    const as = a.photo_sequence ?? Number.MAX_SAFE_INTEGER;
    const bs = b.photo_sequence ?? Number.MAX_SAFE_INTEGER;
    if (as !== bs) return as - bs;
    return (a.uploaded_at ?? '').localeCompare(b.uploaded_at ?? '');
  });
}

/** Full-size URLs are minted when the lightbox lands on a photo, never up front. */
function Lightbox({
  photos, index, onIndexChange, onClose,
}: {
  photos: LoadDocument[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photo = photos[index];

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    if (!photo?.file_path) { setError('This photo has no stored file.'); return () => { alive = false; }; }
    createDocumentSignedUrl(photo.file_path)
      .then(signed => { if (alive) setUrl(signed); })
      .catch(() => { if (alive) setError('Could not load this photo. Close and try again.'); });
    return () => { alive = false; };
  }, [photo?.file_path]);

  const go = useCallback((delta: number) => {
    const next = (index + delta + photos.length) % photos.length;
    onIndexChange(next);
  }, [index, photos.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!photo) return null;
  const gps = photo.capture_latitude != null && photo.capture_longitude != null
    ? `${Number(photo.capture_latitude).toFixed(5)}, ${Number(photo.capture_longitude).toFixed(5)}`
    : null;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="pr-8 text-sm font-semibold">
          {photo.photo_label || photo.document_name || `Photo ${index + 1}`}
        </DialogTitle>

        <div className="relative flex min-h-[240px] items-center justify-center rounded-md bg-muted">
          {url ? (
            <img src={url} alt={photo.photo_label ?? 'Inspection photo'} className="max-h-[60dvh] w-auto rounded-md object-contain" />
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}

          {photos.length > 1 ? (
            <>
              <Button
                type="button" variant="secondary" size="icon" aria-label="Previous photo"
                className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
                onClick={() => go(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button" variant="secondary" size="icon" aria-label="Next photo"
                className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
                onClick={() => go(1)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          ) : null}
        </div>

        <div className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">
            Photo {index + 1} of {photos.length} · Captured {formatDateTime(photo.uploaded_at)}
          </p>
          {gps ? <p className="text-xs text-muted-foreground">GPS {gps}</p> : null}
          {photo.damage_noted ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="mr-1.5 inline h-4 w-4" />
              Damage noted{photo.damage_notes ? `: ${photo.damage_notes}` : '.'}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Gallery({ title, photos }: { title: string; photos: LoadDocument[] }) {
  const ordered = sortPhotos(photos);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {title} ({ordered.length} {ordered.length === 1 ? 'photo' : 'photos'})
        </h3>
        {ordered.some(p => p.damage_noted) ? (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
            Damage noted
          </Badge>
        ) : null}
      </div>

      {ordered.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">This inspection has not been submitted yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {ordered.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              className="group text-left"
              onClick={() => setOpenIndex(i)}
              aria-label={`Open ${photo.photo_label || `photo ${i + 1}`}`}
            >
              <div className="relative">
                <DocumentThumbnail
                  filePath={photo.file_path}
                  alt={photo.photo_label ?? 'Inspection photo'}
                  isImage
                  className={cn(
                    'h-20 w-full rounded-md transition group-hover:border-primary/60',
                    photo.damage_noted && 'border-destructive/60 ring-1 ring-destructive/40',
                  )}
                />
                {photo.damage_noted ? (
                  <span className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground">
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {photo.photo_label || `Photo ${i + 1}`}
              </p>
            </button>
          ))}
        </div>
      )}

      {openIndex !== null ? (
        <Lightbox
          photos={ordered}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  );
}

export default function LoadoutGalleries({ documents }: { documents: LoadDocument[] }) {
  const pickup = documents.filter(d => d.document_type === 'loadout_pickup_inspection');
  const delivery = documents.filter(d => d.document_type === 'loadout_delivery_inspection');

  return (
    <div className="space-y-5 rounded-lg border border-border bg-background p-4">
      <Gallery title="Pickup Inspection" photos={pickup} />
      <Gallery title="Delivery Inspection" photos={delivery} />
    </div>
  );
}
