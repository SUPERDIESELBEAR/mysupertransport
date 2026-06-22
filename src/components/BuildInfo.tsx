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
  return (
    <div
      className={
        className ??
        'text-[10px] text-muted-foreground/60 font-mono tracking-tight px-3 py-2 text-center select-none'
      }
      title={`Build ${__BUILD_VERSION__} · ${iso}`}
    >
      v.{__BUILD_VERSION__} · {formatted} CT
    </div>
  );
}

export default BuildInfo;
