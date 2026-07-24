import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildReturnReceiptPdf, ReturnReceiptInput } from '@/lib/equipmentReceiptPdf';
import { useBackButton } from '@/hooks/useBackButton';

interface Props {
  open: boolean;
  onClose: () => void;
  input: ReturnReceiptInput | null;
  title?: string;
}

/**
 * Renders a return-receipt PDF in an iframe so staff can review it before
 * downloading. Rebuilds the blob URL whenever `input` changes and revokes it
 * on close/unmount to avoid leaking memory.
 */
export function ReturnReceiptPreviewModal({ open, onClose, input, title }: Props) {
  const [built, setBuilt] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useBackButton(open, onClose);

  useEffect(() => {
    if (!open || !input) return;
    let revoked = false;
    let currentUrl: string | null = null;
    setError(null);
    try {
      const b = buildReturnReceiptPdf(input);
      currentUrl = b.blobUrl;
      setBuilt({ blobUrl: b.blobUrl, filename: b.filename });
    } catch (e: any) {
      console.error('[ReturnReceiptPreviewModal] build failed', e);
      setError(e?.message || 'Could not generate the receipt PDF.');
    }
    return () => {
      if (currentUrl && !revoked) {
        revoked = true;
        URL.revokeObjectURL(currentUrl);
      }
      setBuilt(null);
    };
  }, [open, input]);

  const heading = useMemo(() => title || 'Return Receipt Preview', [title]);

  const handleDownload = () => {
    if (!built) return;
    const a = document.createElement('a');
    a.href = built.blobUrl;
    a.download = built.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            Review the receipt below, then download it if it looks right.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted/40 border-y border-border">
          {error ? (
            <div className="h-full min-h-[400px] flex items-center justify-center px-6 text-sm text-destructive text-center">
              {error}
            </div>
          ) : !built ? (
            <div className="h-full min-h-[400px] flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Building receipt…
            </div>
          ) : (
            <iframe
              key={built.blobUrl}
              title={heading}
              src={built.blobUrl}
              className="w-full h-full min-h-[60vh]"
            />
          )}
        </div>

        <DialogFooter className="px-6 py-4 gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={handleDownload} disabled={!built} className="gap-2">
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}