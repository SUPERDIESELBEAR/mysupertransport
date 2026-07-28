import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'show_demo_accounts';

interface ShowDemoContextValue {
  /** When false (default), demo driver accounts are hidden from staff list surfaces. */
  showDemo: boolean;
  setShowDemo: (next: boolean) => void;
  toggleShowDemo: () => void;
}

const ShowDemoContext = createContext<ShowDemoContextValue>({
  showDemo: false,
  setShowDemo: () => {},
  toggleShowDemo: () => {},
});

export function ShowDemoProvider({ children }: { children: ReactNode }) {
  const [showDemo, setShowDemoState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch { return false; }
  });

  const setShowDemo = useCallback((next: boolean) => {
    setShowDemoState(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false'); } catch {}
  }, []);

  const toggleShowDemo = useCallback(() => {
    setShowDemoState((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false'); } catch {}
      return next;
    });
  }, []);

  return (
    <ShowDemoContext.Provider value={{ showDemo, setShowDemo, toggleShowDemo }}>
      {children}
    </ShowDemoContext.Provider>
  );
}

export function useShowDemo() {
  return useContext(ShowDemoContext);
}

/**
 * Apply the "hide demo accounts" rule to a Supabase query builder.
 * Pass the query and the current showDemo value.
 */
export function demoFilter<T extends { eq: (col: string, val: unknown) => T }>(
  query: T,
  showDemo: boolean,
  column = 'is_demo',
): T {
  return showDemo ? query : query.eq(column, false);
}
