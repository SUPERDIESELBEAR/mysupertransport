import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

export interface BinderEmailDoc {
  id: string;
  title: string;
  token?: string | null;
  url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: BinderEmailDoc[];
  driverName: string;
  unitNumber: string | null;
  /** Called after a successful send (once the dialog auto-closes). */
  onSent?: () => void;
  /** Offline escape hatch — hand off to the device mail app. */
  onUseMailApp?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Shared "email roadside documents" dialog used by both the binder flipbook
 * and the list view, so every share sends the same branded HTML email through
 * the `send-binder-share` edge function instead of a raw `mailto:` blob.
 */
export default function BinderEmailShareDialog({
  open, onOpenChange, docs, driverName, unitNumber, onSent, onUseMailApp,
}: Props) {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ to: string; count: number } | null>(null);
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (sentTimer.current) clearTimeout(sentTimer.current); }, []);

  // Fresh state each time the dialog is opened.
  useEffect(() => {
    if (open) {
      setNote('');
      setError(null);
      setSent(null);
      if (sentTimer.current) { clearTimeout(sentTimer.current); sentTimer.current = null; }
    }
  }, [open]);

  const send = async () => {
    if (!docs.length) return;
    const to = recipient.trim();
    if (!EMAIL_RE.test(to)) {
      setError('Enter a valid recipient email address.');
      return;
    }
    setError(null);
    setSent(null);
    setSending(true);
    try {
      const { data, error: fnError } = await withTimeout(
        supabase.functions.invoke('send-binder-share', {
          body: {
            recipientEmail: to,
            driverName,
            unitNumber,
            note: note.trim() || null,
            items: docs.map(d => ({
              token: d.token ?? null,
              url: d.token ? null : d.url ?? null,
              title: d.title,
            })),
          },
        }),
        45000,
        'Sending the email',
      );
      if (fnError) throw fnError;
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
      toast({
        title: 'Documents sent',
        description: `${docs.length} document${docs.length === 1 ? '' : 's'} emailed to ${to}.`,
      });
      setSent({ to, count: docs.length });
      if (sentTimer.current) clearTimeout(sentTimer.current);
      sentTimer.current = setTimeout(() => {
        onOpenChange(false);
        setSent(null);
        onSent?.();
      }, 2000);
    } catch (err) {
      const message = await getEdgeFunctionErrorMessage(
        err,
        err instanceof Error ? err.message : 'Please try again.',
      );
      setError(`${message}${onUseMailApp ? ' You can still use “Use my mail app instead”.' : ''}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!sending) {
          onOpenChange(o);
          if (!o) { setError(null); setSent(null); }
        }
      }}
    >
      <DialogContent className="max-w-md z-[120]">
        <DialogHeader>
          <DialogTitle>Email roadside {docs.length === 1 ? 'document' : 'documents'}</DialogTitle>
          <DialogDescription>
            Sends a clean, branded SUPERTRANSPORT email with a secure View button for each document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {sent && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Email sent</p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  Sent to {sent.to} — {sent.count} document{sent.count === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Could not send the email</p>
                <p className="mt-0.5 text-xs leading-relaxed">{error}</p>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Including ({docs.length})
            </p>
            <ul className="space-y-1">
              {docs.map(d => (
                <li key={d.id} className="text-xs text-foreground truncate">• {d.title}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="binder-share-email" className="text-xs">Recipient email</Label>
            <Input
              id="binder-share-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="officer@example.gov"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="binder-share-note" className="text-xs">Note (optional)</Label>
            <Textarea
              id="binder-share-note"
              rows={3}
              maxLength={600}
              placeholder="Anything the recipient should know…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {onUseMailApp ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={sending || !!sent}
              onClick={() => { onOpenChange(false); onUseMailApp(); }}
            >
              Use my mail app instead
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={sending || !!sent} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={send}
              disabled={sending || !!sent}
              className={`gap-1.5 ${sent ? 'bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100' : ''}`}
            >
              {sent
                ? <CheckCircle2 className="h-4 w-4" />
                : sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sent ? 'Sent' : sending ? 'Sending…' : 'Send email'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}