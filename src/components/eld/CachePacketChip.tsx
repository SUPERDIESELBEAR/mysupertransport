import { useEffect, useState } from 'react';
import { subscribeHydration, type HydrationProgress } from '@/lib/eld/offline/hydrate';

/**
 * Cache readiness for the roadside packet.
 *
 * A file that is cached but not decodable in-app still counts as cached — the
 * packet shows it as a named card with an Open action, so it is present and
 * openable and must not read as Incomplete.
 */
export default function CachePacketChip({ className = '' }: { className?: string }) {
  const [p, setP] = useState<HydrationProgress | null>(null);
  useEffect(() => subscribeHydration(setP), []);
  if (!p || p.phase === 'idle') return null;

  const { label, color, bg } = describe(p);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ color, background: bg }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function describe(p: HydrationProgress) {
  if (p.phase === 'running') {
    const label = p.documentsTotal > 0
      ? `Caching ${Math.min(p.documentsDone + 1, p.documentsTotal)} of ${p.documentsTotal} ELD logs`
      : 'Saving records for roadside';
    return { label, color: '#E08A2E', bg: 'rgba(224,138,46,0.12)' };
  }
  if (p.phase === 'ready') {
    return { label: 'Roadside packet ready', color: '#2E7D4F', bg: 'rgba(46,125,79,0.12)' };
  }
  if (p.phase === 'incomplete') {
    return {
      label: `Roadside packet incomplete — ${p.cachedDays} of ${p.totalDays} days saved`,
      color: '#E08A2E', bg: 'rgba(224,138,46,0.12)',
    };
  }
  return { label: 'Roadside packet unavailable', color: '#C0392B', bg: 'rgba(192,57,43,0.12)' };
}