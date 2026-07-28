import { useEffect, useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  clearPreviewSession,
  getPreviewSession,
  isPreviewSessionExpired,
  type PreviewSessionMarker,
} from '@/lib/previewSession';

export default function PreviewSessionBanner() {
  const { signOut } = useAuth();
  const [marker, setMarker] = useState<PreviewSessionMarker | null>(() => getPreviewSession());

  useEffect(() => {
    if (!marker) return;

    const endSession = () => {
      clearPreviewSession();
      setMarker(null);
      signOut();
    };

    if (isPreviewSessionExpired(marker)) {
      endSession();
      return;
    }

    const timer = window.setInterval(() => {
      const current = getPreviewSession();
      if (!current) {
        setMarker(null);
        return;
      }
      if (isPreviewSessionExpired(current)) endSession();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [marker, signOut]);

  if (!marker) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 px-3 py-2 bg-warning text-warning-foreground border-b border-warning-foreground/20">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <p className="text-xs font-semibold truncate">
          Preview session — signed in as {marker.name}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          clearPreviewSession();
          setMarker(null);
          signOut();
        }}
        className="flex items-center gap-1.5 shrink-0 rounded-md border border-warning-foreground/30 px-2.5 py-1 text-xs font-semibold hover:bg-warning-foreground/10 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        End preview
      </button>
    </div>
  );
}
