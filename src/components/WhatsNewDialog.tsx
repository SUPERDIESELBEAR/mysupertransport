/**
 * The sign-in pop-up for published What's New announcements.
 *
 * Rendered once per portal shell. It shows one announcement at a time, newest
 * first, and records a read row as soon as the person sees it — so it never
 * reappears unless the announcement requires a "Got it" that has not been given.
 *
 * It deliberately stays out of the way:
 *  - nothing in demo mode (nothing there is real),
 *  - nothing while another dialog or sheet already owns the screen, which is how
 *    a form in progress is left alone,
 *  - a short settle delay after arrival, so it never races the page in.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Megaphone, ArrowRight, Check } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useUnreadReleaseNotes } from '@/hooks/useUnreadReleaseNotes';
import { CATEGORY_LABELS } from '@/lib/releaseNotes/types';
import { useToast } from '@/hooks/use-toast';

export default function WhatsNewDialog() {
  const { isDemo } = useDemoMode();
  const { unread, loading, markRead } = useUnreadReleaseNotes();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const note = unread[0] ?? null;

  useEffect(() => {
    if (isDemo || loading || !note || open) return;
    const t = window.setTimeout(() => {
      // Another dialog or sheet already open? Wait for the next visit.
      const busyOverlay = document.querySelector('[role="dialog"], [data-state="open"][role="alertdialog"]');
      if (busyOverlay) return;
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [isDemo, loading, note, open]);

  const dismiss = async (acknowledge: boolean, then?: () => void) => {
    if (!note) return;
    setBusy(true);
    try {
      await markRead(note.id, acknowledge);
      setOpen(false);
      then?.();
    } catch (err) {
      toast({
        title: 'Could not mark this as read',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!note) return null;

  const remaining = unread.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !note.requires_ack) void dismiss(false); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-5 w-5 text-gold shrink-0" />
            <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[note.category] ?? 'Update'}</Badge>
            {note.requires_ack && (
              <Badge className="text-[10px] bg-gold/15 text-gold border-gold/30">Please confirm</Badge>
            )}
          </div>
          <DialogTitle className="text-left">{note.title}</DialogTitle>
          <DialogDescription className="text-left whitespace-pre-line text-foreground/80">
            {note.body}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {remaining > 0 && (
            <span className="text-xs text-muted-foreground sm:mr-auto self-center">
              {remaining} more to read
            </span>
          )}
          {note.link_route && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={busy}
              onClick={() => void dismiss(note.requires_ack, () => navigate(note.link_route!))}
            >
              {note.link_label?.trim() || 'Take me there'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button className="gap-2" disabled={busy} onClick={() => void dismiss(true)}>
            <Check className="h-4 w-4" />
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
