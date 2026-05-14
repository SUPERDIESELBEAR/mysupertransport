import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, MailMinus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Status =
  | 'validating'
  | 'ready'
  | 'submitting'
  | 'success'
  | 'already'
  | 'invalid'
  | 'no-token';

export default function Unsubscribe() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('validating');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus('invalid');
          return;
        }
        if (json.valid === false && json.reason === 'already_unsubscribed') {
          setStatus('already');
          return;
        }
        setStatus('ready');
      } catch (e: any) {
        setError(e?.message || 'Something went wrong');
        setStatus('invalid');
      }
    })();
  }, [token]);

  async function confirm() {
    if (!token) return;
    setStatus('submitting');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'handle-email-unsubscribe',
        { body: { token } },
      );
      if (invokeError) throw invokeError;
      if (data?.success) {
        setStatus('success');
      } else if (data?.reason === 'already_unsubscribed') {
        setStatus('already');
      } else {
        setStatus('invalid');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to unsubscribe');
      setStatus('invalid');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-5">
        <div className="mx-auto h-12 w-12 rounded-full bg-gold/15 flex items-center justify-center">
          <MailMinus className="h-6 w-6 text-gold" />
        </div>
        <h1 className="text-xl font-semibold text-surface-dark">
          SUPERTRANSPORT — Email preferences
        </h1>

        {status === 'validating' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verifying your link…</span>
          </div>
        )}

        {status === 'no-token' && (
          <p className="text-sm text-muted-foreground">
            This unsubscribe link is missing a token. Please use the link
            from the email you received.
          </p>
        )}

        {status === 'ready' && (
          <>
            <p className="text-sm text-muted-foreground">
              Click below to stop receiving compliance emails from
              SUPERTRANSPORT at this address.
            </p>
            <Button onClick={confirm} className="w-full bg-gold text-surface-dark hover:bg-gold/90">
              Confirm unsubscribe
            </Button>
          </>
        )}

        {status === 'submitting' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing…</span>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="text-sm text-surface-dark">
              You&rsquo;ve been unsubscribed. You will no longer receive
              email from this address.
            </p>
          </div>
        )}

        {status === 'already' && (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="text-sm text-surface-dark">
              This address is already unsubscribed.
            </p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-2">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error || 'This link is invalid or has expired.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}