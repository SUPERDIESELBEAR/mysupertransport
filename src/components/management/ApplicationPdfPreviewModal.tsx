import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Printer, ExternalLink, AlertTriangle } from 'lucide-react';
import { generateApplicationPdf, saveObjectUrl } from '@/lib/application/generateApplicationPdf';

interface Props {
  applicationId: string;
  applicantName: string;
  onClose: () => void;
}

/**
 * Shows the exact server-rendered application PDF before it is downloaded.
 *
 * The preview is the same bytes as the download: the document is generated
 * once, held as a blob for the modal's lifetime, and rendered in an iframe so
 * the browser's native PDF viewer handles paging and zoom.
 */
export default function ApplicationPdfPreviewModal({ applicationId, applicantName, onClose }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    (async () => {
      try {
        const result = await generateApplicationPdf(applicationId, applicantName);
        created = result.objectUrl;
        if (cancelled) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        setObjectUrl(result.objectUrl);
        setFilename(result.filename);
      } catch (err) {
        if (!cancelled) setError((err as Error)?.message ?? 'The document could not be generated.');
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [applicationId, applicantName]);

  const handlePrint = () => {
    if (!objectUrl) return;
    try {
      const frame = iframeRef.current;
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
      throw new Error('frame unavailable');
    } catch {
      // iOS and some embedded viewers block printing from inside the frame.
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1.5rem)] max-h-[90dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base">Application preview</DialogTitle>
          <DialogDescription className="text-xs">
            {applicantName} — this is the exact document that downloads or prints.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border-y border-border bg-muted/40">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-foreground font-medium">Could not build the document</p>
              <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
              <p className="text-xs text-muted-foreground">
                Use “Print application” on the card as a fallback.
              </p>
            </div>
          ) : !objectUrl ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Building the document…</p>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={objectUrl}
              title={`Application preview — ${applicantName}`}
              className="w-full h-[70dvh] min-h-[320px] bg-white"
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 shrink-0 flex-wrap">
          {objectUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => window.open(objectUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handlePrint}
            disabled={!objectUrl}
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => objectUrl && saveObjectUrl(objectUrl, filename)}
            disabled={!objectUrl}
          >
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
