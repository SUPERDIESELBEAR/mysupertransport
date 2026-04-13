import { useState, useEffect, useCallback } from "react";
import { Download, Share, Smartphone, Monitor, ChevronRight, CheckCircle2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
}

export default function InstallApp() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const ios = isIOS();
  const standalone = isInStandaloneMode();

  useEffect(() => {
    if (standalone) { setInstalled(true); return; }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [standalone]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return (
    <div className="min-h-screen bg-surface-dark text-white">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-surface-dark-muted hover:text-white transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-12 w-12 rounded-xl bg-gold/20 flex items-center justify-center">
            <Download className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Install SUPERDRIVE</h1>
            <p className="text-sm text-surface-dark-muted">Get the full app experience</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 space-y-6">
        {/* Already installed */}
        {installed && (
          <div className="rounded-xl bg-status-complete/10 border border-status-complete/30 p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-status-complete flex-shrink-0" />
            <div>
              <p className="font-semibold text-status-complete text-sm">SUPERDRIVE is installed!</p>
              <p className="text-xs text-surface-dark-muted mt-0.5">You're using the app in standalone mode.</p>
            </div>
          </div>
        )}

        {/* Quick install button for Android */}
        {deferredPrompt && !installed && (
          <button
            onClick={install}
            className="w-full rounded-xl bg-gold text-surface-dark font-bold text-sm py-4 flex items-center justify-center gap-2 hover:bg-gold-light transition-colors"
          >
            <Download className="h-5 w-5" /> Install SUPERDRIVE Now
          </button>
        )}

        {/* Why install */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gold">Why install the app?</h2>
          <ul className="space-y-2">
            {[
              "Full-screen experience — no browser bars",
              "Quick access from your home screen",
              "Faster load times with cached assets",
              "Push notification support",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-surface-dark-muted">
                <ChevronRight className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* iOS Instructions */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-sm">iPhone / iPad (Safari)</h2>
          </div>
          <ol className="space-y-4">
            <Step num={1}>
              Open this page in <span className="font-semibold text-white">Safari</span> (not Chrome or another browser)
            </Step>
            <Step num={2}>
              Tap the <Share className="inline h-4 w-4 text-gold -mt-0.5 mx-0.5" /> <span className="font-semibold text-gold">Share</span> button at the bottom of the screen
            </Step>
            <Step num={3}>
              Scroll down and tap <span className="font-semibold text-gold">"Add to Home Screen"</span>
            </Step>
            <Step num={4}>
              Tap <span className="font-semibold text-white">"Add"</span> in the top-right corner — done!
            </Step>
          </ol>
        </div>

        {/* Android Instructions */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-sm">Android (Chrome)</h2>
          </div>
          {deferredPrompt ? (
            <p className="text-sm text-surface-dark-muted">
              Use the <span className="font-semibold text-gold">"Install SUPERDRIVE Now"</span> button above — Chrome will handle the rest!
            </p>
          ) : (
            <ol className="space-y-4">
              <Step num={1}>
                Open this page in <span className="font-semibold text-white">Chrome</span>
              </Step>
              <Step num={2}>
                Tap the <span className="font-semibold text-gold">⋮ menu</span> (three dots) in the top-right corner
              </Step>
              <Step num={3}>
                Tap <span className="font-semibold text-gold">"Add to Home screen"</span> or <span className="font-semibold text-gold">"Install app"</span>
              </Step>
              <Step num={4}>
                Tap <span className="font-semibold text-white">"Install"</span> to confirm — done!
              </Step>
            </ol>
          )}
        </div>

        {/* Desktop Instructions */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-gold" />
            <h2 className="font-semibold text-sm">Desktop (Chrome / Edge)</h2>
          </div>
          <ol className="space-y-4">
            <Step num={1}>
              Look for the <span className="font-semibold text-gold">install icon</span> (⊕) in the address bar
            </Step>
            <Step num={2}>
              Click it and select <span className="font-semibold text-gold">"Install"</span>
            </Step>
          </ol>
        </div>

        {/* Footer note */}
        <p className="text-xs text-center text-surface-dark-muted px-4">
          SUPERDRIVE is a Progressive Web App — no app store download required. Works on any modern browser.
        </p>
      </div>
    </div>
  );
}

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">
        {num}
      </span>
      <span className="text-sm text-surface-dark-muted leading-relaxed">{children}</span>
    </li>
  );
}
