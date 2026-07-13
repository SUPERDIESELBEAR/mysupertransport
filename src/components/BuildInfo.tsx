import { useRef, useState } from 'react';
import DriverDiagnosticsPanel from '@/components/operator/DriverDiagnosticsPanel';

declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;

interface BuildInfoProps {
  className?: string;
}

/**
 * Tiny build version + timestamp display.
 * Both values are baked in at build time via Vite `define`.
 * Use this to confirm staff are running the latest published build.
 */
export function BuildInfo({ className }: BuildInfoProps) {
  // `__BUILD_TIME__` is injected by Vite `define` at build time. In dev or
  // when the define is misconfigured the value can be missing/invalid, which
  // would throw inside `toLocaleString`. Fall back to the raw string so the
  // footer stays visible instead of crashing the whole layout.
  let formatted = __BUILD_TIME__ ?? 'dev';
  let iso = formatted;
  try {
    const date = new Date(__BUILD_TIME__);
    if (!Number.isNaN(date.getTime())) {
      iso = date.toISOString();
      formatted = date.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  } catch {
    // keep raw string fallback
  }

  // Hidden 5-tap gesture opens the driver diagnostics panel — no visible
  // affordance, so support can safely walk any user through it.
  const tapsRef = useRef<number[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const handleTap = () => {
    const now = Date.now();
    const kept = tapsRef.current.filter((t) => now - t < 3000);
    kept.push(now);
    tapsRef.current = kept;
    if (kept.length >= 5) {
      tapsRef.current = [];
      setDiagOpen(true);
    }
  };

  return (
    <>
      <div
        onClick={handleTap}
        className={
          className ??
          'text-[10px] text-muted-foreground/60 font-mono tracking-tight px-3 py-2 text-center select-none cursor-default'
        }
        title={`Build ${__BUILD_VERSION__} · ${iso}`}
      >
        v.{__BUILD_VERSION__} · {formatted} CT
      </div>
      <DriverDiagnosticsPanel open={diagOpen} onOpenChange={setDiagOpen} />
    </>
  );
}

export default BuildInfo;
