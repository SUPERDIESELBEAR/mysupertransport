import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { buildReturnReceiptPdf, ReturnReceiptInput } from '@/lib/equipmentReceiptPdf';
import { useBackButton } from '@/hooks/useBackButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDemoMode } from '@/hooks/useDemoMode';

interface Props {
  open: boolean;
  onClose: () => void;
  input: ReturnReceiptInput | null;
  title?: string;
  /** When provided, enables the "Email to Operator" action. */
  operatorId?: string | null;
}

/**
 * Renders a return-receipt PDF in an iframe so staff can review it before
 * downloading. Rebuilds the blob URL whenever `input` changes and revokes it
 * on close/unmount to avoid leaking memory.
 */
export function ReturnReceiptPreviewModal({ open, onClose, input, title, operatorId }: Props) {
  const [built, setBuilt] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const { guardDemo } = useDemoMode();
  const [blob, setBlob] = useState<Blob | null>(null);

  useBackButton(open, onClose);

  useEffect(() => {
    if (!open || !input) return;
    let revoked = false;
    let currentUrl: string | null = null;
    setError(null);
    setShowNote(false);
    setNote('');
    try {
      const b = buildReturnReceiptPdf(input);
      currentUrl = b.blobUrl;
      setBuilt({ blobUrl: b.blobUrl, filename: b.filename });
      setBlob(b.blob);
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
      setBlob(null);
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

  const handleEmail = async () => {
    if (guardDemo()) return;
    if (!operatorId || !blob || !built || !input) return;
    setEmailing(true);
    try {
      const buf = await blob.arrayBuffer();
      // Chunked base64 encode to avoid call-stack overflow on large PDFs
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const pdfBase64 = btoa(binary);

      const { data, error: fnError } = await supabase.functions.invoke('send-return-receipt-pdf', {
        body: {
          operatorId,
          pdfBase64,
          filename: built.filename,
          itemCount: input.items.length,
          note: note.trim() || null,
        },
      });
      if (fnError) throw fnError;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error || 'Email failed');
      }
      const to = (data as any)?.recipient;
      toast.success(to ? `Emailed to ${to}` : 'Return receipt emailed to operator.');
      setShowNote(false);
      setNote('');
    } catch (err: any) {
      console.error('[ReturnReceiptPreviewModal] email failed', err);
      toast.error(err?.message || "We couldn't email the receipt. Please try again.");
    } finally {
      setEmailing(false);
    }
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

        {operatorId && showNote && (
          <div className="px-6 pt-3 space-y-1.5 border-t border-border">
            <label className="text-xs font-medium text-foreground">
              Optional note to the operator
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              placeholder="e.g. Confirming your returned equipment — thanks!"
              rows={2}
              className="text-sm"
              disabled={emailing}
            />
          </div>
        )}

        <DialogFooter className="px-6 py-4 gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={emailing}>Close</Button>
          <div className="flex gap-2">
            {operatorId && (
              <Button
                variant="outline"
                onClick={showNote ? handleEmail : () => setShowNote(true)}
                disabled={!built || emailing}
                className="gap-2"
              >
                {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {showNote ? 'Send Email' : 'Email to Operator'}
              </Button>
            )}
            <Button onClick={handleDownload} disabled={!built || emailing} className="gap-2">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}