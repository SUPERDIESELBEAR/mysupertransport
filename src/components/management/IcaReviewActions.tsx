import { useRef, useState } from 'react';
import { Download, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import ICADocumentView from '@/components/ica/ICADocumentView';
import { BLANK_ICA_DATA } from '@/lib/ica/blankIcaData';
import { downloadIcaPdf } from '@/lib/ica/generateIcaPdf';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Download / email actions for the blank, watermarked ICA review copy.
 * Renders the document off-screen so html2canvas has real layout to rasterize.
 */
export default function IcaReviewActions({ compact = false }: { compact?: boolean }) {
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  async function handleDownload() {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      await downloadIcaPdf(docRef.current, 'SUPERTRANSPORT-ICA-Review-Copy.pdf');
      toast.success('Review copy downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the PDF');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSend() {
    if (!name.trim()) { toast.error('Enter the recipient name'); return; }
    if (!EMAIL_RE.test(email.trim())) { toast.error('Enter a valid email address'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-ica-review-link', {
        body: { recipientName: name.trim(), recipientEmail: email.trim(), note: note.trim() || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Review copy sent to ${email.trim()}`);
      setEmailOpen(false);
      setName(''); setEmail(''); setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the review copy');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className={compact ? 'flex items-center gap-2' : 'grid grid-cols-2 gap-2'}>
        <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download Review Copy
        </Button>
        <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => setEmailOpen(true)}>
          <Mail className="h-3.5 w-3.5" /> Email for Review
        </Button>
      </div>

      {/* Off-screen render target for PDF generation */}
      <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, width: '816px', pointerEvents: 'none' }}>
        <div ref={docRef}>
          <ICADocumentView data={BLANK_ICA_DATA} operatorName="" previewMode watermark />
        </div>
      </div>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Email ICA for Review</DialogTitle>
            <DialogDescription>
              Sends a branded email with a link to the watermarked agreement. The link
              expires in 30 days and collects no signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ica-review-name">Recipient name</Label>
              <Input id="ica-review-name" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ica-review-email">Recipient email</Label>
              <Input id="ica-review-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ica-review-note">Note (optional)</Label>
              <Textarea id="ica-review-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Anything you'd like them to know before reading." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Review Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}