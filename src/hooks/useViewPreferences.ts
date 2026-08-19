import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { SortState, SortDirection } from '@/lib/listSorting';

export interface ViewPreferences {
  visibleColumns: string[];
  sort: SortState | null;
}

interface Options {
  /** Identifies the list, e.g. 'loads_list'. */
  viewKey: string;
  defaultVisibleColumns: string[];
  defaultSort?: SortState | null;
}

const cacheKey = (userId: string, viewKey: string) => `view_prefs_${viewKey}_${userId}`;

/**
 * Per-user list view preferences (visible columns + sort), stored in
 * `user_view_preferences`. Seeds from a localStorage cache for instant first
 * paint, then reconciles with the account record so the view follows the user
 * across devices. Saves are debounced.
 *
 * Reusable by any list page: pass a unique `viewKey` and the page defaults.
 */
export function useViewPreferences({ viewKey, defaultVisibleColumns, defaultSort = null }: Options) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(defaultVisibleColumns);
  const [sort, setSortState] = useState<SortState | null>(defaultSort);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed from cache
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(cacheKey(userId, viewKey));
      if (raw) {
        const cached = JSON.parse(raw) as Partial<ViewPreferences>;
        if (Array.isArray(cached.visibleColumns)) setVisibleColumnsState(cached.visibleColumns);
        if (cached.sort !== undefined) setSortState(cached.sort ?? null);
      }
    } catch {
      /* ignore malformed cache */
    }
  }, [userId, viewKey]);

  // Load the account record
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_view_preferences')
        .select('visible_columns, sort_column, sort_direction')
        .eq('user_id', userId)
        .eq('view_key', viewKey)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (Array.isArray(data.visible_columns)) {
          setVisibleColumnsState(data.visible_columns as string[]);
        }
        setSortState(
          data.sort_column
            ? { column: data.sort_column, direction: (data.sort_direction as SortDirection) ?? 'asc' }
            : null,
        );
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, viewKey]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = useCallback((next: ViewPreferences) => {
    if (!userId) return;
    try {
      localStorage.setItem(cacheKey(userId, viewKey), JSON.stringify(next));
    } catch {
      /* storage full / unavailable */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase
        .from('user_view_preferences')
        .upsert(
          {
            user_id: userId,
            view_key: viewKey,
            visible_columns: next.visibleColumns,
            sort_column: next.sort?.column ?? null,
            sort_direction: next.sort?.direction ?? null,
          },
          { onConflict: 'user_id,view_key' },
        )
        .then(({ error }) => {
          if (error) console.error('Failed to save view preferences', error);
        });
    }, 600);
  }, [userId, viewKey]);

  const setVisibleColumns = useCallback((next: string[]) => {
    setVisibleColumnsState(next);
    setSortState(current => { persist({ visibleColumns: next, sort: current }); return current; });
  }, [persist]);

  const setSort = useCallback((next: SortState | null) => {
    setSortState(next);
    setVisibleColumnsState(current => { persist({ visibleColumns: current, sort: next }); return current; });
  }, [persist]);

  const reset = useCallback(() => {
    setVisibleColumnsState(defaultVisibleColumns);
    setSortState(defaultSort);
    persist({ visibleColumns: defaultVisibleColumns, sort: defaultSort });
  }, [defaultVisibleColumns, defaultSort, persist]);

  return { visibleColumns, sort, setVisibleColumns, setSort, reset, loaded };
}
