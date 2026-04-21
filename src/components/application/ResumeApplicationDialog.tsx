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

export default function ResumeApplicationDialog({ open, onOpenChange }: Props) {
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
      const { error: invokeErr } = await supabase.functions.invoke('request-application-resume', {
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
          <DialogTitle className="text-foreground">Resume your application</DialogTitle>
          <DialogDescription>
            Enter the email you applied with and we'll send you a secure link to pick up where you left off.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-gold mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Check your inbox</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                If an application exists for that email, we've sent a resume link. It's valid for 24 hours and can only be used once.
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
              {submitting ? 'Sending link…' : 'Send resume link'}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              We'll never share your email. Links expire after 24 hours.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}