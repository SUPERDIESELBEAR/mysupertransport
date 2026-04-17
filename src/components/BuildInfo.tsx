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
  const date = new Date(__BUILD_TIME__);
  const formatted = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return (
    <div
      className={
        className ??
        'text-[10px] text-muted-foreground/60 font-mono tracking-tight px-3 py-2 text-center select-none'
      }
      title={`Build ${__BUILD_VERSION__} · ${date.toISOString()}`}
    >
      v.{__BUILD_VERSION__} · {formatted} CT
    </div>
  );
}

export default BuildInfo;
