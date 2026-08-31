import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { SortState, SortDirection } from '@/lib/listSorting';

export type ViewFilters = Record<string, unknown> | null;

export interface ViewPreferences {
  visibleColumns: string[];
  sort: SortState | null;
  filters: ViewFilters;
}

interface Options {
  /** Identifies the list, e.g. 'loads_list'. */
  viewKey: string;
  defaultVisibleColumns: string[];
  defaultSort?: SortState | null;
  /** Optional. Consumers that do not manage filters leave stored filters untouched. */
  defaultFilters?: ViewFilters;
  /**
   * Columns added to the page AFTER users already had saved views. A saved set
   * written before the column existed cannot express an opinion about it, so
   * the keys are merged in once (per device) and the version marker is bumped.
   * Users may hide them afterwards and the choice sticks.
   */
  introducedColumns?: { version: number; keys: string[] };
}

const cacheKey = (userId: string, viewKey: string) => `view_prefs_${viewKey}_${userId}`;
const versionKey = (userId: string, viewKey: string) => `view_prefs_v_${viewKey}_${userId}`;


/**
 * Per-user list view preferences (visible columns + sort + filters), stored in
 * `user_view_preferences`. Seeds from a localStorage cache for instant first
 * paint, then reconciles with the account record so the view follows the user
 * across devices. Saves are debounced.
 *
 * HAZARD: `persist` upserts every managed field together. A consumer that does
 * not manage one of them must never blank it. That is why the live value lives
 * in a single ref — whatever was loaded (including filters this consumer never
 * touches) is carried through every save.
 *
 * Reusable by any list page: pass a unique `viewKey` and the page defaults.
 */
export function useViewPreferences({
  viewKey,
  defaultVisibleColumns,
  defaultSort = null,
  defaultFilters = null,
  introducedColumns,
}: Options) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Stable across renders: the option object is a fresh literal each time.
  const introducedRef = useRef(introducedColumns);
  introducedRef.current = introducedColumns;

  /**
   * Merges columns introduced after this user's view was saved. Returns the set
   * unchanged once the user has expressed an opinion on the new version, which
   * is recorded the first time they change columns.
   */
  const withIntroduced = useCallback((stored: string[]): string[] => {
    const intro = introducedRef.current;
    if (!intro || !userId) return stored;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(versionKey(userId, viewKey)) ?? 0) || 0;
    } catch { /* storage unavailable */ }
    if (seen >= intro.version) return stored;
    const missing = intro.keys.filter(k => !stored.includes(k));
    return missing.length ? [...stored, ...missing] : stored;
  }, [userId, viewKey]);

  const markIntroducedSeen = useCallback(() => {
    const intro = introducedRef.current;
    if (!intro || !userId) return;
    try {
      localStorage.setItem(versionKey(userId, viewKey), String(intro.version));
    } catch { /* storage unavailable */ }
  }, [userId, viewKey]);



  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(defaultVisibleColumns);
  const [sort, setSortState] = useState<SortState | null>(defaultSort);
  const [filters, setFiltersState] = useState<ViewFilters>(defaultFilters);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Single source of truth for what a save should write. */
  const currentRef = useRef<ViewPreferences>({
    visibleColumns: defaultVisibleColumns,
    sort: defaultSort,
    filters: defaultFilters,
  });
  currentRef.current = { visibleColumns, sort, filters };

  // Seed from cache
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(cacheKey(userId, viewKey));
      if (raw) {
        const cached = JSON.parse(raw) as Partial<ViewPreferences>;
        if (Array.isArray(cached.visibleColumns)) setVisibleColumnsState(withIntroduced(cached.visibleColumns));
        if (cached.sort !== undefined) setSortState(cached.sort ?? null);
        if (cached.filters !== undefined) setFiltersState((cached.filters as ViewFilters) ?? null);
      }
    } catch {
      /* ignore malformed cache */
    }
  }, [userId, viewKey, withIntroduced]);

  // Load the account record
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_view_preferences')
        .select('visible_columns, sort_column, sort_direction, filters')
        .eq('user_id', userId)
        .eq('view_key', viewKey)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (Array.isArray(data.visible_columns)) {
          const merged = withIntroduced(data.visible_columns as string[]);
          setVisibleColumnsState(merged);
          currentRef.current = { ...currentRef.current, visibleColumns: merged };
        }
        setSortState(
          data.sort_column
            ? { column: data.sort_column, direction: (data.sort_direction as SortDirection) ?? 'asc' }
            : null,
        );
        const storedFilters = (data as { filters?: unknown }).filters;
        if (storedFilters !== undefined && storedFilters !== null) {
          setFiltersState(storedFilters as ViewFilters);
          currentRef.current = { ...currentRef.current, filters: storedFilters as ViewFilters };
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, viewKey, withIntroduced]);



  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = useCallback(() => {
    if (!userId) return;
    const next = currentRef.current;
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
            visible_columns: currentRef.current.visibleColumns,
            sort_column: currentRef.current.sort?.column ?? null,
            sort_direction: currentRef.current.sort?.direction ?? null,
            filters: currentRef.current.filters ?? null,
          } as never,
          { onConflict: 'user_id,view_key' },
        )
        .then(({ error }) => {
          if (error) console.error('Failed to save view preferences', error);
        });
    }, 600);
  }, [userId, viewKey]);

  const setVisibleColumns = useCallback((next: string[]) => {
    // The user has now chosen for themselves; stop force-merging new columns.
    markIntroducedSeen();
    setVisibleColumnsState(next);
    currentRef.current = { ...currentRef.current, visibleColumns: next };
    persist();
  }, [persist, markIntroducedSeen]);


  const setSort = useCallback((next: SortState | null) => {
    setSortState(next);
    currentRef.current = { ...currentRef.current, sort: next };
    persist();
  }, [persist]);

  const setFilters = useCallback((next: ViewFilters) => {
    setFiltersState(next);
    currentRef.current = { ...currentRef.current, filters: next };
    persist();
  }, [persist]);

  const reset = useCallback(() => {
    setVisibleColumnsState(defaultVisibleColumns);
    setSortState(defaultSort);
    setFiltersState(defaultFilters);
    currentRef.current = {
      visibleColumns: defaultVisibleColumns,
      sort: defaultSort,
      filters: defaultFilters,
    };
    persist();
  }, [defaultVisibleColumns, defaultSort, defaultFilters, persist]);

  return { visibleColumns, sort, filters, setVisibleColumns, setSort, setFilters, reset, loaded };
}
