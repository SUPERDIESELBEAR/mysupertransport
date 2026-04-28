import { useState, useEffect, useCallback } from "react";
import { Download, Share, Smartphone, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}
function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
}

interface InstallStepProps {
  /** Called when the user finishes (installed, dismissed, or skipped). */
  onContinue: () => void;
  continueLabel?: string;
}

/**
 * Inline "Install SUPERDRIVE" step used inside the welcome / onboarding flow.
 * - Android/Desktop: shows native install button via beforeinstallprompt
 * - iOS Safari: shows Share → Add to Home Screen instructions
 * - Already standalone: auto-marks installed and lets the user continue
 */
export default function InstallStep({ onContinue, continueLabel = "Continue to Portal" }: InstallStepProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const ios = isIOS();
  const android = isAndroid();

  useEffect(() => {
    if (installed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [installed]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (installed) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-status-complete/10 border border-status-complete/30 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-status-complete shrink-0" />
          <div>
            <p className="font-semibold text-status-complete text-sm">SUPERDRIVE is installed!</p>
            <p className="text-xs text-surface-dark-muted mt-0.5">You're ready to head to your portal.</p>
          </div>
        </div>
        <Button
          onClick={onContinue}
          className="w-full bg-gold text-surface-dark font-bold hover:bg-gold-light h-12 text-sm tracking-wide"
        >
          {continueLabel} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h3 className="text-surface-dark-foreground font-bold text-base">Install SUPERDRIVE</h3>
          <p className="text-xs text-surface-dark-muted">Add it to your home screen for one-tap access.</p>
        </div>
      </div>

      {ios ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold text-gold uppercase tracking-wide">iPhone / iPad — Safari</p>
          <ol className="space-y-3">
            <Step num={1}>
              Tap the <Share className="inline h-4 w-4 text-gold -mt-0.5 mx-0.5" /> <span className="font-semibold text-gold">Share</span> button at the bottom of Safari
            </Step>
            <Step num={2}>
              Scroll down and tap <span className="font-semibold text-gold">"Add to Home Screen"</span>
            </Step>
            <Step num={3}>
              Tap <span className="font-semibold text-white">"Add"</span> in the top-right — done!
            </Step>
          </ol>
        </div>
      ) : deferredPrompt ? (
        <Button
          onClick={handleInstall}
          className="w-full bg-gold text-surface-dark font-bold hover:bg-gold-light h-12 text-sm tracking-wide"
        >
          <Download className="h-5 w-5 mr-2" /> Install SUPERDRIVE Now
        </Button>
      ) : (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold text-gold uppercase tracking-wide">
            {android ? "Android — Chrome" : "Desktop — Chrome / Edge"}
          </p>
          {android ? (
            <ol className="space-y-3">
              <Step num={1}>
                Tap the <span className="font-semibold text-gold">⋮ menu</span> in the top-right
              </Step>
              <Step num={2}>
                Tap <span className="font-semibold text-gold">"Install app"</span> or <span className="font-semibold text-gold">"Add to Home screen"</span>
              </Step>
              <Step num={3}>
                Tap <span className="font-semibold text-white">"Install"</span> — done!
              </Step>
            </ol>
          ) : (
            <ol className="space-y-3">
              <Step num={1}>
                Look for the <span className="font-semibold text-gold">install icon (⊕)</span> in the address bar
              </Step>
              <Step num={2}>
                Click it and select <span className="font-semibold text-gold">"Install"</span>
              </Step>
            </ol>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="w-full text-center text-xs text-surface-dark-muted hover:text-gold transition-colors py-2"
      >
        Skip for now → {continueLabel.toLowerCase()}
      </button>
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