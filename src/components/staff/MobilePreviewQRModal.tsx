import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Copy, Loader2, RefreshCw, Smartphone, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetName: string;
}

export default function MobilePreviewQRModal({ open, onOpenChange, targetUserId, targetName }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUrl(null);
    setQrDataUrl(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-preview-session', {
        body: { target_user_id: targetUserId },
      });
      if (fnError || !data?.url) {
        setError(data?.error || 'Could not create a preview code.');
        return;
      }
      setUrl(data.url);
      setExpiresAt(new Date(data.expires_at).getTime());
      setQrDataUrl(
        await QRCode.toDataURL(data.url, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      );
    } catch {
      setError('Could not create a preview code.');
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    if (open) generate();
  }, [open, generate]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  const expired = !!expiresAt && secondsLeft <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Open on my phone
          </DialogTitle>
          <DialogDescription>
            Scan this code to sign in on your phone as {targetName}. Actions you take are real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Creating secure code…
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && qrDataUrl && (
            <>
              <div className="flex justify-center">
                <div className={`p-3 rounded-xl bg-white border border-border ${expired ? 'opacity-30' : ''}`}>
                  <img src={`${qrDataUrl}`} alt={`Preview sign-in QR code for ${targetName}`} className="h-56 w-56" />
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                {expired
                  ? 'This code has expired.'
                  : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} · single use`}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  disabled={!url || expired}
                  onClick={() => {
                    if (url) {
                      navigator.clipboard.writeText(url);
                      toast({ title: 'Preview link copied' });
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={generate}>
                  <RefreshCw className="h-3.5 w-3.5" /> New code
                </Button>
              </div>
            </>
          )}

          {!loading && error && (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={generate}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
