import { useState, useEffect, useCallback } from "react";
import { X, Download, Share, ExternalLink, Copy, Check, ChevronRight } from "lucide-react";
import {
  isIOS,
  isStandalone as isInStandaloneMode,
  isInAppBrowser,
  copyToClipboard,
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
  const [showGuide, setShowGuide] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
                  setShowGuide(true);
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

      {showGuide && (
        <div
          className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md bg-surface-dark border border-gold/30 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface-dark border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gold/20 flex items-center justify-center">
                  <Download className="h-4 w-4 text-gold" />
                </div>
                <h2 className="text-base font-bold text-white tracking-wide">Install SUPERDRIVE</h2>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                aria-label="Close"
                className="p-2 text-surface-dark-muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {inAppBrowser ? (
                <>
                  <div className="rounded-xl bg-status-warning/10 border border-status-warning/30 p-4">
                    <p className="text-sm font-bold text-status-warning mb-1">
                      You're in an in-app browser
                    </p>
                    <p className="text-xs text-surface-dark-muted leading-relaxed">
                      To install SUPERDRIVE on your home screen, you need to open
                      this page in <span className="font-semibold text-gold">Safari</span>.
                      Gmail, Facebook, and other in-app browsers cannot install apps.
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                    <p className="text-xs font-semibold text-gold uppercase tracking-wide">
                      Step 1 — Open in Safari
                    </p>
                    <ol className="space-y-3 text-sm text-surface-dark-muted leading-relaxed">
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">1</span>
                        <span>Tap the <span className="font-semibold text-white">⋯ menu</span> (top-right of this browser)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">2</span>
                        <span>Tap <span className="font-semibold text-gold">"Open in Safari"</span> or <span className="font-semibold text-gold">"Open in Browser"</span></span>
                      </li>
                    </ol>
                  </div>

                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-status-complete" /> Link copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy link to paste in Safari
                      </>
                    )}
                  </button>

                  <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                    <p className="text-xs font-semibold text-gold uppercase tracking-wide">
                      Step 2 — Add to Home Screen (in Safari)
                    </p>
                    <ol className="space-y-3 text-sm text-surface-dark-muted leading-relaxed">
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">1</span>
                        <span>Tap the <Share className="inline w-4 h-4 text-gold -mt-0.5" /> <span className="font-semibold text-gold">Share</span> button at the bottom of Safari</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">2</span>
                        <span>Scroll down and tap <span className="font-semibold text-gold">"Add to Home Screen"</span></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">3</span>
                        <span>Tap <span className="font-semibold text-white">"Add"</span> in the top-right — done!</span>
                      </li>
                    </ol>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-surface-dark-muted leading-relaxed">
                    Add SUPERDRIVE to your home screen for one-tap access — no app store needed.
                  </p>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                    <p className="text-xs font-semibold text-gold uppercase tracking-wide">
                      iPhone / iPad — Safari
                    </p>
                    <ol className="space-y-3 text-sm text-surface-dark-muted leading-relaxed">
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">1</span>
                        <span>Tap the <Share className="inline w-4 h-4 text-gold -mt-0.5" /> <span className="font-semibold text-gold">Share</span> button at the bottom of Safari</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">2</span>
                        <span>Scroll down and tap <span className="font-semibold text-gold">"Add to Home Screen"</span></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">3</span>
                        <span>Tap <span className="font-semibold text-white">"Add"</span> in the top-right — done!</span>
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
