import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, X, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

declare const __BUILD_VERSION__: string;
declare const __BUILD_TIME__: string;

const STORAGE_KEY = 'build-status-banner-dismissed';
const FORCE_KEY = 'build-status-banner-force';

interface VersionInfo {
  version: string;
  buildTime: string;
}

function isPublicHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.localStorage.getItem(FORCE_KEY) === '1') return true;
  const host = window.location.hostname;
  return (
    host.includes('lovable.app') ||
    host.includes('lovableproject.com') ||
    host.includes('id-preview--')
  );
}

function formatBuildTime(raw?: string): string {
  if (!raw || raw === 'dev') return 'dev';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return raw;
  }
}

/**
 * Sticky banner that confirms the currently-running build matches the latest
 * deployed version from `/version.json`. Useful for verifying preview deploys.
 */
export function BuildStatusBanner() {
  const [remote, setRemote] = useState<VersionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  const localVersion = useMemo(() => {
    try {
      return __BUILD_VERSION__ ?? 'dev';
    } catch {
      return 'dev';
    }
  }, []);

  const localTime = useMemo(() => formatBuildTime(__BUILD_TIME__), []);

  const remoteVersion = remote?.version ?? '—';
  const remoteTime = formatBuildTime(remote?.buildTime);
  const matched = loaded && remoteVersion === localVersion && remoteVersion !== '—';

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  };

  useEffect(() => {
    if (!isPublicHost()) return;

    let cancelled = false;
    const fetchVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<VersionInfo>;
        if (cancelled) return;
        setRemote({
          version: data.version ?? 'unknown',
          buildTime: data.buildTime ?? '',
        });
      } catch {
        // fail silently — don't block the banner if version.json is missing
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isPublicHost() || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-gold/30 bg-surface-dark/95 backdrop-blur supports-[backdrop-filter]:bg-surface-dark/80">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {matched ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/15">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-surface-dark-foreground">
              <span className="truncate">
                {matched
                  ? 'Running the latest deployed build'
                  : loaded
                    ? 'A newer build may be available'
                    : 'Checking build status...'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-surface-dark-muted">
              <span className="font-mono">v.{localVersion}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline items-center gap-1">
                <Clock className="h-3 w-3" />
                {localTime} CT
              </span>
              {loaded && remoteVersion !== '—' && (
                <>
                  <span className="hidden sm:inline">|</span>
                  <span className="font-mono">
                    remote: v.{remoteVersion}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!matched && loaded && (
            <Button
              size="sm"
              onClick={() => window.location.reload()}
              className="bg-gold hover:bg-gold-light text-surface-dark h-7 text-xs px-2.5"
            >
              Refresh
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            className="h-7 w-7 text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card"
            aria-label="Dismiss build status"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BuildStatusBanner;
