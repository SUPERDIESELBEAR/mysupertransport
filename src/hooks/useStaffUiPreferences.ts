import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type StaffUiPrefs = Record<string, unknown>;

const cacheKey = (userId: string) => `staff_ui_prefs_${userId}`;

/**
 * Per-staff UI preferences (column visibility, etc).
 * Seeds from a localStorage cache for instant first paint, then reconciles with
 * the account-level record so preferences follow the staff member across devices.
 */
export function useStaffUiPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [prefs, setPrefs] = useState<StaffUiPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed from cache
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(cacheKey(userId));
      if (raw) setPrefs(JSON.parse(raw));
    } catch {
      /* ignore malformed cache */
    }
  }, [userId]);

  // Load from the account record
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('staff_ui_preferences')
        .select('prefs')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.prefs && typeof data.prefs === 'object') {
        const next = data.prefs as StaffUiPrefs;
        setPrefs(next);
        try {
          localStorage.setItem(cacheKey(userId), JSON.stringify(next));
        } catch {
          /* storage full / unavailable */
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const updatePrefs = useCallback((patch: StaffUiPrefs) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      if (userId) {
        try {
          localStorage.setItem(cacheKey(userId), JSON.stringify(next));
        } catch {
          /* storage full / unavailable */
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void supabase
            .from('staff_ui_preferences')
            .upsert({ user_id: userId, prefs: next as never }, { onConflict: 'user_id' })
            .then(({ error }) => {
              if (error) console.error('Failed to save UI preferences', error);
            });
        }, 600);
      }
      return next;
    });
  }, [userId]);

  return { prefs, updatePrefs, loaded };
}