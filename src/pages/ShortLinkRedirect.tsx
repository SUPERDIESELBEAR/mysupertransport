import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type State =
  | { status: 'loading' }
  | { status: 'found'; token: string }
  | { status: 'not_found' };

/**
 * Resolves a short binder share code (e.g. /s/ab12cd34) into the underlying
 * /inspect/{token} route. The row is anon-readable — the security boundary is
 * the inspect token itself, which already carries its own expiration.
 */
export default function ShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code || !/^[a-z0-9]{4,32}$/.test(code)) {
        if (!cancelled) setState({ status: 'not_found' });
        return;
      }
      const { data, error } = await supabase
        .from('document_short_links')
        .select('share_token')
        .eq('code', code)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.share_token) {
        setState({ status: 'not_found' });
      } else {
        setState({ status: 'found', token: data.share_token });
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Opening secure document…</p>
      </div>
    );
  }

  if (state.status === 'not_found') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-warning" />
        <p className="text-base font-semibold text-foreground">Link not found</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          This share link is invalid or has been revoked. Ask the driver to send a new one.
        </p>
      </div>
    );
  }

  return <Navigate to={`/inspect/${state.token}`} replace />;
}