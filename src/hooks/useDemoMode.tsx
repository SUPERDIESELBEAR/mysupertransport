import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { toast } from '@/hooks/use-toast';

interface DemoModeContextValue {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  /** Call inside any write handler to block the action and show a toast. Returns true if blocked. */
  guardDemo: () => boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemo: false,
  enterDemo: () => {},
  exitDemo: () => {},
  guardDemo: () => false,
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => {
    try { return sessionStorage.getItem('demoMode') === 'true'; }
    catch { return false; }
  });

  const enterDemo = useCallback(() => {
    setIsDemo(true);
    try { sessionStorage.setItem('demoMode', 'true'); } catch {}
    toast({
      title: '🎓 Demo Mode Active',
      description: 'Browse freely — all changes are blocked.',
    });
  }, []);

  const exitDemo = useCallback(() => {
    setIsDemo(false);
    try { sessionStorage.removeItem('demoMode'); } catch {}
    toast({
      title: 'Demo Mode Off',
      description: 'You are now back in live mode.',
    });
  }, []);

  const guardDemo = useCallback(() => {
    if (!isDemo) return false;
    toast({
      title: 'Demo Mode',
      description: 'This action is disabled. Exit demo to make real changes.',
    });
    return true;
  }, [isDemo]);

  return (
    <DemoModeContext.Provider value={{ isDemo, enterDemo, exitDemo, guardDemo }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
