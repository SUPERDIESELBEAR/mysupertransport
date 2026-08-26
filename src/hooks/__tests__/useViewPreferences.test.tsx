/**
 * useViewPreferences: filters round-trip and the shared-hook hazard.
 *
 * `persist` upserts every managed field together, so a consumer that never
 * calls setFilters must still carry any stored filters through its own saves.
 * The fixtures here are written by the hook's own upsert path — nothing is
 * hand-authored except the very first stored row in the regression case, which
 * is itself produced by a prior hook render.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const store: Record<string, Record<string, unknown>> = {};
const key = (userId: string, viewKey: string) => `${userId}|${viewKey}`;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
        maybeSingle: async () => ({
          data: store[key(filters.user_id as string, filters.view_key as string)] ?? null,
          error: null,
        }),
        upsert: (row: Record<string, unknown>) => ({
          then: (cb: (r: { error: null }) => void) => {
            store[key(row.user_id as string, row.view_key as string)] = { ...row };
            cb({ error: null });
            return Promise.resolve({ error: null });
          },
        }),
      };
      return builder;
    },
  },
}));

import { useViewPreferences } from '../useViewPreferences';

const flush = async () => {
  await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve(); });
};

describe('useViewPreferences', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('applies defaults when no stored record exists', async () => {
    const { result } = renderHook(() => useViewPreferences({
      viewKey: 'v_defaults',
      defaultVisibleColumns: ['a', 'b'],
      defaultSort: { column: 'created_at', direction: 'desc' },
      defaultFilters: { dispatcher: 'all' },
    }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visibleColumns).toEqual(['a', 'b']);
    expect(result.current.sort).toEqual({ column: 'created_at', direction: 'desc' });
    expect(result.current.filters).toEqual({ dispatcher: 'all' });
  });

  it('round-trips filters: set, persist, read back', async () => {
    const first = renderHook(() => useViewPreferences({
      viewKey: 'v_round',
      defaultVisibleColumns: ['a'],
      defaultFilters: { dispatcher: 'all' },
    }));
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    act(() => { first.result.current.setFilters({ dispatcher: 'u-jack' }); });
    await flush();
    expect(store[key('u1', 'v_round')].filters).toEqual({ dispatcher: 'u-jack' });

    localStorage.clear();
    const second = renderHook(() => useViewPreferences({
      viewKey: 'v_round',
      defaultVisibleColumns: ['a'],
      defaultFilters: { dispatcher: 'all' },
    }));
    await waitFor(() => expect(second.result.current.filters).toEqual({ dispatcher: 'u-jack' }));
  });

  it('a consumer that does not manage filters leaves stored filters intact', async () => {
    // A filter-aware consumer stores a value first (written by the hook itself).
    const aware = renderHook(() => useViewPreferences({
      viewKey: 'v_shared',
      defaultVisibleColumns: ['a'],
      defaultFilters: { dispatcher: 'all' },
    }));
    await waitFor(() => expect(aware.result.current.loaded).toBe(true));
    act(() => { aware.result.current.setFilters({ dispatcher: 'u-yasir' }); });
    await flush();
    aware.unmount();
    localStorage.clear();

    // A filter-unaware consumer (LoadsListPage shape) saves columns and sort.
    const unaware = renderHook(() => useViewPreferences({
      viewKey: 'v_shared',
      defaultVisibleColumns: ['a'],
    }));
    await waitFor(() => expect(unaware.result.current.loaded).toBe(true));
    act(() => { unaware.result.current.setVisibleColumns(['a', 'b']); });
    await flush();
    act(() => { unaware.result.current.setSort({ column: 'rate', direction: 'asc' }); });
    await flush();

    const row = store[key('u1', 'v_shared')];
    expect(row.visible_columns).toEqual(['a', 'b']);
    expect(row.sort_column).toBe('rate');
    expect(row.filters).toEqual({ dispatcher: 'u-yasir' });
  });

  it('reset restores default columns, sort and filters', async () => {
    const { result } = renderHook(() => useViewPreferences({
      viewKey: 'v_reset',
      defaultVisibleColumns: ['a'],
      defaultSort: { column: 'created_at', direction: 'desc' },
      defaultFilters: { dispatcher: 'all' },
    }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => { result.current.setFilters({ dispatcher: 'u-jack' }); });
    act(() => { result.current.setVisibleColumns(['a', 'b']); });
    await flush();
    act(() => { result.current.reset(); });
    await flush();

    expect(result.current.filters).toEqual({ dispatcher: 'all' });
    expect(result.current.visibleColumns).toEqual(['a']);
    expect(result.current.sort).toEqual({ column: 'created_at', direction: 'desc' });
    const row = store[key('u1', 'v_reset')];
    expect(row.filters).toEqual({ dispatcher: 'all' });
    expect(row.visible_columns).toEqual(['a']);
  });
});
