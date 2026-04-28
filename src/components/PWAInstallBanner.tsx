import { useState, useEffect, useCallback } from "react";
import { X, Download, Share, ChevronRight } from "lucide-react";
import {
  isIOS,
  isStandalone as isInStandaloneMode,
  isInAppBrowser,
} from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "superdrive-pwa-dismissed";

function isInIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

function isPreviewHost() {
  return window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    if (isInIframe() || isPreviewHost() || isInStandaloneMode()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    setDismissed(false);
    setInAppBrowser(isInAppBrowser());

    if (isIOS()) {
      setShowIOSBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSBanner(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  }, [deferredPrompt, dismiss]);

  if (dismissed) return null;
  if (!deferredPrompt && !showIOSBanner) return null;

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-[9999] safe-bottom">
        <div className="mx-3 mb-3 rounded-xl bg-surface-dark border border-gold/30 shadow-2xl">
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={() => {
                if (deferredPrompt) {
                  void install();
                } else {
                  window.location.assign("/install");
                }
              }}
              className="flex-1 flex items-center gap-3 p-4 text-left hover:bg-white/5 active:bg-white/10 transition-colors rounded-l-xl"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                <Download className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white tracking-wide">Install SUPERDRIVE</p>
                {inAppBrowser && showIOSBanner ? (
                  <p className="text-xs text-surface-dark-muted mt-1">
                    <span className="font-semibold text-gold">Open in Safari</span> first to install — tap to see how
                  </p>
                ) : showIOSBanner ? (
                  <p className="text-xs text-surface-dark-muted mt-1">
                    Tap to see how — uses{" "}
                    <Share className="inline w-3.5 h-3.5 text-gold -mt-0.5" />{" "}
                    <span className="font-semibold text-gold">Add to Home Screen</span>
                  </p>
                ) : (
                  <p className="text-xs text-surface-dark-muted mt-1">
                    Add to your home screen for the full app experience
                  </p>
                )}
              </div>
              {deferredPrompt ? (
                <span className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-gold text-surface-dark text-xs font-bold tracking-wide">
                  Install
                </span>
              ) : (
                <ChevronRight className="flex-shrink-0 w-5 h-5 text-gold" />
              )}
            </button>
            <button
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="flex-shrink-0 p-3 text-surface-dark-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
