import { useState, type ReactNode, type MouseEvent } from 'react';
import { FilePreviewModal } from '@/components/inspection/DocRow';

/**
 * Anchor wrapper that opens files in the in-app FilePreviewModal on left-click
 * instead of a new browser tab. Keeps `href` + `target="_blank"` so right-click
 * "Open in new tab" still works as a power-user escape hatch. The modal itself
 * also renders an "Open in new tab" button for iOS PDF reliability and printing.
 */
export function PreviewLink({
  url,
  name,
  bucketName,
  filePath,
  className,
  children,
  onSaved,
}: {
  url: string;
  name: string;
  bucketName?: string;
  filePath?: string;
  className?: string;
  children: ReactNode;
  onSaved?: (newUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Preserve modifier/middle-click "open in new tab" behavior
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={className}
      >
        {children}
      </a>
      {open && (
        <FilePreviewModal
          url={url}
          name={name}
          bucketName={bucketName}
          filePath={filePath}
          onSaved={onSaved}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}