import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Global offline indicator. Mounts once at the app root and shows a thin
 * banner whenever `navigator.onLine` is false. Auto-hides on reconnect.
 * Polite live region so screen readers announce the state change.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only-when-online"
    >
      {!online && (
        <div
          className="fixed top-0 inset-x-0 z-[10000] bg-amber-500 text-amber-950 text-xs font-semibold px-3 py-1.5 flex items-center justify-center gap-2 shadow-md"
          role="alert"
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          <span>You're offline — changes will sync when reconnected.</span>
        </div>
      )}
    </div>
  );
}