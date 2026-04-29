import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isStandalone } from '@/lib/pwa';

/**
 * Tracks operator portal presence so the staff roster can distinguish:
 *   - Installed (stamps `operators.pwa_installed_at` first time we see standalone)
 *   - Web only (stamps `operators.last_web_seen_at` on any visit)
 *   - Never signed in (neither column is set)
 *
 * Mounted globally inside the AuthProvider tree so it fires on EVERY
 * authenticated route, not just /dashboard.
 */
export function useTrackOperatorPresence() {
  const { user, isOperator } = useAuth();
  const sentThisSession = useRef(false);

  useEffect(() => {
    // Skip in iframe / preview contexts (same heuristic the PWA banner uses)
    const inIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const previewHost =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('id-preview--') ||
        window.location.hostname.includes('lovableproject.com'));
    if (inIframe || previewHost) return;

    if (!user || !isOperator) return;

    const ping = async (standalone: boolean) => {
      try {
        await supabase.rpc('mark_operator_seen' as any, { _standalone: standalone });
      } catch {
        // fire-and-forget; never disrupt UX
      }
    };

    // Fire once per browser session
    if (!sentThisSession.current) {
      sentThisSession.current = true;
      ping(isStandalone());
    }

    // Capture native install (Android Chrome) the moment it happens
    const onAppInstalled = () => ping(true);
    window.addEventListener('appinstalled', onAppInstalled);

    // Listen for display-mode flip → standalone (post-install on Android)
    let mql: MediaQueryList | null = null;
    const onModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) ping(true);
    };
    try {
      mql = window.matchMedia('(display-mode: standalone)');
      mql.addEventListener?.('change', onModeChange);
    } catch {
      /* older Safari */
    }

    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
      mql?.removeEventListener?.('change', onModeChange);
    };
  }, [user, isOperator]);
}