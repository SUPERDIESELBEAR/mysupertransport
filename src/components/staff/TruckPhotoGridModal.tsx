import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Camera, ExternalLink, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Must match the labels used in TruckPhotoGuideModal PHOTO_SLOTS
const PHOTO_POSITIONS = [
  { key: 'Front',                 icon: '🚛', group: 'Exterior' },
  { key: 'Driver Side',           icon: '⬅️', group: 'Exterior' },
  { key: 'Rear',                  icon: '🔙', group: 'Exterior' },
  { key: 'Passenger Side',        icon: '➡️', group: 'Exterior' },
  { key: 'PS Steer Tire',         icon: '🛞', group: 'Tires' },
  { key: 'DS Steer Tire',         icon: '🛞', group: 'Tires' },
  { key: 'DS Front Drive Tires',  icon: '🛞', group: 'Tires' },
  { key: 'DS Rear Drive Tires',   icon: '🛞', group: 'Tires' },
  { key: 'PS Front Drive Tires',  icon: '🛞', group: 'Tires' },
  { key: 'PS Rear Drive Tires',   icon: '🛞', group: 'Tires' },
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
  files: DocFileRow[];
  onMarkReceived?: () => void;
  isMarkingReceived?: boolean;
  alreadyReceived?: boolean;
}

/** Extract the position label from a file_name like "Driver Side — IMG_3421.jpg" */
function extractLabel(fileName: string | null): string {
  if (!fileName) return '';
  const sep = ' — ';
  const idx = fileName.indexOf(sep);
  return idx >= 0 ? fileName.substring(0, idx).trim() : '';
}

/** Extract storage path from a file_url (handles both legacy public URLs and raw paths) */
function extractStoragePath(fileUrl: string): string {
  // Handle both absolute and relative signed URLs containing the bucket name
  const bucketMarker = '/operator-documents/';
  const idx = fileUrl.indexOf(bucketMarker);
  if (idx >= 0) {
    return decodeURIComponent(fileUrl.substring(idx + bucketMarker.length).split('?')[0]);
  }
  // Already a raw path — strip leading slash if present
  return fileUrl.replace(/^\//, '');
}

export default function TruckPhotoGridModal({
  open,
  onClose,
  files,
  onMarkReceived,
  isMarkingReceived,
  alreadyReceived,
}: Props) {
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);

  // Generate signed URLs when modal opens
  useEffect(() => {
    if (!open || files.length === 0) {
      setSignedUrls({});
      return;
    }

    let cancelled = false;
    setLoadingUrls(true);

    (async () => {
      const map: Record<string, string> = {};
      const supabaseBase = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';

      await Promise.all(
        files
          .filter(f => f.file_url)
          .map(async (f) => {
            const path = extractStoragePath(f.file_url!);
            const { data } = await supabase.storage
              .from('operator-documents')
              .createSignedUrl(path, 3600);
            if (data?.signedUrl) {
              // Ensure absolute URL
              let url = data.signedUrl;
              if (url.startsWith('/storage/v1/')) {
                url = `${supabaseBase}${url}`;
              }
              map[f.id] = url;
            }
          })
      );

      if (!cancelled) {
        setSignedUrls(map);
        setLoadingUrls(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, files]);

  // Build a map: position label → most recent file (last uploaded wins)
  const byPosition: Record<string, DocFileRow> = {};
  for (const f of files) {
    const label = extractLabel(f.file_name);
    if (!label) continue;
    const existing = byPosition[label];
    if (!existing || new Date(f.uploaded_at) > new Date(existing.uploaded_at)) {
      byPosition[label] = f;
    }
  }

  const uploadedCount = Object.keys(byPosition).length;

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-3xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-semibold">Truck Photos</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {uploadedCount} of {PHOTO_POSITIONS.length} positions uploaded
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!alreadyReceived && onMarkReceived && (
                  <button
                    disabled={isMarkingReceived || uploadedCount === 0}
                    onClick={onMarkReceived}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-status-complete bg-status-complete/10 hover:bg-status-complete/20 border border-status-complete/30 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isMarkingReceived
                      ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      : <CheckCircle2 className="h-3 w-3" />}
                    {isMarkingReceived ? 'Saving…' : 'Mark as Received'}
                  </button>
                )}
                {alreadyReceived && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-status-complete">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Received
                  </span>
                )}
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 overflow-y-auto max-h-[70vh]">
            {loadingUrls ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
              </div>
            ) : (
              <>
                {/* Exterior group */}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Exterior</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {PHOTO_POSITIONS.filter(p => p.group === 'Exterior').map(pos => {
                    const file = byPosition[pos.key];
                    const resolvedUrl = file ? signedUrls[file.id] : undefined;
                    return (
                      <PhotoCell
                        key={pos.key}
                        pos={pos}
                        file={file}
                        resolvedUrl={resolvedUrl}
                        onOpenLightbox={url => setLightbox({ url, label: pos.key })}
                      />
                    );
                  })}
                </div>

                {/* Tires group */}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Tires</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {PHOTO_POSITIONS.filter(p => p.group === 'Tires').map(pos => {
                    const file = byPosition[pos.key];
                    const resolvedUrl = file ? signedUrls[file.id] : undefined;
                    return (
                      <PhotoCell
                        key={pos.key}
                        pos={pos}
                        file={file}
                        resolvedUrl={resolvedUrl}
                        onOpenLightbox={url => setLightbox({ url, label: pos.key })}
                      />
                    );
                  })}
                </div>

                {/* Extra files not matched to a position */}
                {(() => {
                  const unmatched = files.filter(f => {
                    const label = extractLabel(f.file_name);
                    return !label || !PHOTO_POSITIONS.find(p => p.key === label);
                  });
                  if (!unmatched.length) return null;
                  return (
                    <div className="mt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Other Files</p>
                      <ul className="space-y-1">
                        {unmatched.map(f => (
                          <li key={f.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/40">
                            <span className="truncate text-foreground max-w-[260px]">{f.file_name ?? 'Unnamed'}</span>
                            {signedUrls[f.id] && (
                              <a href={signedUrls[f.id]} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-light shrink-0 ml-2">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Dialog open onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-4xl p-0 gap-0 bg-black/90 border-0">
            <div className="relative">
              <button
                onClick={() => setLightbox(null)}
                className="absolute top-3 right-3 z-10 text-white/80 hover:text-white bg-black/40 rounded-full p-1"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="absolute top-3 left-3 z-10 text-white text-sm font-semibold bg-black/50 rounded px-2 py-0.5">
                {lightbox.label}
              </div>
              <img
                src={lightbox.url}
                alt={lightbox.label}
                className="w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

interface PhotoCellProps {
  pos: { key: string; icon: string };
  file: DocFileRow | undefined;
  resolvedUrl: string | undefined;
  onOpenLightbox: (url: string) => void;
}

function PhotoCell({ pos, file, resolvedUrl, onOpenLightbox }: PhotoCellProps) {
  const [imgError, setImgError] = useState(false);
  const hasFile = !!file;
  // Treat any resolved signed URL as a previewable image (this modal is truck-photos-only)
  const hasImage = hasFile && !!resolvedUrl && !imgError;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`relative rounded-lg overflow-hidden aspect-[4/3] border transition-colors ${
          hasImage
            ? 'border-border cursor-pointer group'
            : hasFile
            ? 'border-info/30 bg-info/5'
            : 'border-dashed border-muted-foreground/30 bg-muted/30'
        }`}
        onClick={() => hasImage && resolvedUrl && onOpenLightbox(resolvedUrl)}
      >
        {hasImage ? (
          <>
            <img
              src={resolvedUrl}
              alt={pos.key}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="absolute top-1.5 right-1.5 bg-status-complete rounded-full p-0.5">
              <CheckCircle2 className="h-3 w-3 text-white" />
            </div>
          </>
        ) : hasFile ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
            <span className="text-2xl">{pos.icon}</span>
            {resolvedUrl && (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-[10px] text-gold hover:text-gold-light font-medium"
              >
                View file <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
            <Camera className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <p className={`text-[10px] font-medium leading-tight truncate ${hasFile ? 'text-foreground' : 'text-muted-foreground'}`}>
        {pos.key}
      </p>
    </div>
  );
}
