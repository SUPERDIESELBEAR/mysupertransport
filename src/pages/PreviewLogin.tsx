import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { startPreviewSession } from '@/lib/previewSession';
import { Loader2, AlertCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/supertransport-logo.png';

export default function PreviewLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get('c') ?? '';
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      if (!code) {
        setError('This preview link is missing its code.');
        return;
      }
      try {
        // Drop any existing session so the preview lands cleanly.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

        const { data, error: fnError } = await supabase.functions.invoke('redeem-preview-session', {
          body: { code },
        });

        if (fnError || !data?.token_hash) {
          setError(data?.error || 'This preview link is no longer valid. Ask staff for a new code.');
          return;
        }

        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: data.token_hash,
        });

        if (otpError) {
          setError('Could not start the preview session. Ask staff for a new code.');
          return;
        }

        startPreviewSession(data.target_name ?? 'Driver');
        navigate('/dashboard', { replace: true });
      } catch {
        setError('Something went wrong starting the preview session.');
      }
    })();
  }, [code, navigate]);

  return (
    <div className="min-h-dvh bg-surface-dark flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <img src={logo} alt="SUPERTRANSPORT" className="h-20 w-auto mx-auto object-contain" />

        {error ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-left">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <Button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full bg-gold text-surface-dark font-semibold hover:bg-gold-light h-11"
            >
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-gold">
              <Eye className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Preview session</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-surface-dark-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-sm">Signing you in…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
