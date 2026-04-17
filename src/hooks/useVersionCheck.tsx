import { useEffect, useRef } from "react";
import { toast } from "sonner";

declare const __BUILD_VERSION__: string;

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("lovableproject.com") ||
    host.includes("id-preview--")
  );
}

/**
 * Polls /version.json and shows a sticky sonner toast when a new build is detected.
 * - Polls every 2 minutes and on tab visibility change
 * - Skips on dev / Lovable preview hosts to avoid spam
 * - Dedupes by toast id and tracks last-notified version
 */
export function useVersionCheck() {
  const sessionVersionRef = useRef<string>(__BUILD_VERSION__);
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPreviewHost()) return;

    let cancelled = false;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled || !data?.version) return;

        const remote = data.version;
        const local = sessionVersionRef.current;

        if (remote !== local && lastNotifiedRef.current !== remote) {
          lastNotifiedRef.current = remote;
          toast("A new version of SUPERDRIVE is available", {
            description: "Refresh to load the latest build.",
            duration: Infinity,
            id: "version-update",
            action: {
              label: "Refresh now",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // Network error or missing manifest — fail silently, retry next interval
      }
    };

    // Initial check shortly after mount
    const initialTimer = window.setTimeout(checkVersion, 5_000);
    const interval = window.setInterval(checkVersion, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", checkVersion);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", checkVersion);
    };
  }, []);
}

export default useVersionCheck;
