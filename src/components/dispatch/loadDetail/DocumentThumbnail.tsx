import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createDocumentSignedUrl } from '@/lib/loadDocuments';

/**
 * Thumbnails are the one place a signed URL must exist at render time, so they
 * use the same short TTL and simply re-mint once if the browser fails to load
 * the image (expired link) rather than showing a broken-image icon.
 */
export default function DocumentThumbnail({
  filePath, alt, className, isImage, onClick,
}: {
  filePath: string | null;
  alt: string;
  className?: string;
  isImage: boolean;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  const alive = useRef(true);

  const mint = useCallback(async () => {
    if (!filePath) return;
    try {
      const signed = await createDocumentSignedUrl(filePath);
      if (alive.current) { setUrl(signed); setFailed(false); }
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [filePath]);

  useEffect(() => {
    alive.current = true;
    retried.current = false;
    if (isImage) void mint();
    return () => { alive.current = false; };
  }, [isImage, mint]);

  const base = cn(
    'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted',
    onClick && 'cursor-pointer',
    className,
  );

  if (!isImage) {
    return (
      <div className={base} onClick={onClick} aria-hidden={!onClick}>
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (failed || !url) {
    return (
      <div className={base} onClick={onClick}>
        {failed
          ? <ImageOff className="h-5 w-5 text-muted-foreground" />
          : <div className="h-full w-full animate-pulse bg-muted" />}
      </div>
    );
  }

  return (
    <div className={base} onClick={onClick}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => {
          if (retried.current) { setFailed(true); return; }
          retried.current = true;
          setUrl(null);
          void mint();
        }}
      />
    </div>
  );
}
