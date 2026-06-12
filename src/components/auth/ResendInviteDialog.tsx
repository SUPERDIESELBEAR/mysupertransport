import { useState } from 'react';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ResendInviteDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setSubmitting(false);
    setSent(false);
    setError(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: invokeErr } = await supabase.functions.invoke('resend-invite', {
        body: { email: trimmed },
      });
      if (invokeErr) {
        setError('Something went wrong. Please try again in a moment.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Resend my sign-in link</DialogTitle>
          <DialogDescription>
            If you were invited as a driver or truck owner, enter your email and we'll send you
            a fresh link to set your password and get into the app.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-gold mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Check your inbox</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                If your email is registered with SUPERTRANSPORT, a fresh sign-in link is on its
                way. It can take a minute or two to arrive — check your spam folder if you don't
                see it.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
                disabled={submitting}
                required
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Sending link…' : 'Send sign-in link'}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Already set a password? Use Sign In instead.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}