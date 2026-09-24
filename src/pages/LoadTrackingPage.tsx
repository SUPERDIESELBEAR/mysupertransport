import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCarrierWindow } from '@/lib/operatorHome';
import { formatCheckInTime } from '@/lib/stopCheckIn';

/**
 * Public broker tracking page (P52 / P64). Calls ONLY resolve_load_tracking_link;
 * no table reads as anon. Shows status and stop times — never money, driver,
 * truck, contacts or addresses beyond city/state.
 */
export interface TrackingStop {
  sequence: number;
  type: string;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  appointment_start: string | null;
  appointment_end: string | null;
  arrived_at: string | null;
  departed_at: string | null;
}
export interface TrackingData {
  outcome: 'ok';
  carrier: { legal_name: string; mc_number: string; usdot_number: string };
  timezone: string;
  load_number: string;
  broker_reference_number: string | null;
  status_label: string;
  last_update_at: string | null;
  stops: TrackingStop[];
}

/** Opening limit is 60 per link per hour; never refresh faster than this. */
export const TRACKING_REFRESH_MS = 5 * 60 * 1000;

type State = { kind: 'loading' } | { kind: 'inactive' } | { kind: 'throttled' } | { kind: 'ok'; data: TrackingData };

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}

export default function LoadTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  useNoIndex();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) { setState({ kind: 'inactive' }); return; }
      const { data, error } = await supabase.rpc('resolve_load_tracking_link', { p_token: token });
      if (cancelled) return;
      const d = data as { outcome?: string } | null;
      if (!error && d?.outcome === 'throttled') setState({ kind: 'throttled' });
      else if (error || !d || d.outcome !== 'ok') setState({ kind: 'inactive' });
      else setState({ kind: 'ok', data: d as TrackingData });
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, TRACKING_REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [token]);

  if (state.kind === 'loading') {
    return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;
  }
  if (state.kind === 'inactive') {
    return <Shell><p className="text-base text-foreground">This tracking link is not active. Contact the carrier for an update.</p></Shell>;
  }
  if (state.kind === 'throttled') {
    return <Shell><p className="text-base text-foreground">This link has been opened many times in the last hour. Please try again later.</p></Shell>;
  }

  const d = state.data;
  const tz = d.timezone;
  const counts: Record<string, number> = {};
  return (
    <Shell>
      <header className="mb-6 border-b border-border pb-4">
        <p className="text-lg font-semibold text-foreground">{d.carrier.legal_name}</p>
        <p className="text-sm text-muted-foreground">Load tracking</p>
      </header>
      <section className="mb-6">
        <p className="text-3xl font-bold text-foreground">{d.status_label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Last update: {d.last_update_at ? formatCheckInTime(d.last_update_at, tz) : 'Not yet'}
        </p>
        <p className="mt-4 text-base font-medium text-foreground">Load {d.load_number}</p>
        {d.broker_reference_number ? (
          <p className="text-sm text-muted-foreground">Your reference: {d.broker_reference_number}</p>
        ) : null}
      </section>
      <ol className="space-y-3">
        {d.stops.map((s) => {
          counts[s.type] = (counts[s.type] ?? 0) + 1;
          const place = [s.city, s.state].filter(Boolean).join(', ');
          const title = `${s.type} ${counts[s.type]} — ${[s.facility_name, place].filter(Boolean).join(', ')}`;
          return (
            <li key={s.sequence} className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Appointment: {formatCarrierWindow(s.appointment_start, s.appointment_end, tz)}
              </p>
              <p className="text-sm text-foreground">Arrived: {s.arrived_at ? formatCheckInTime(s.arrived_at, tz) : 'Not yet'}</p>
              <p className="text-sm text-foreground">Left: {s.departed_at ? formatCheckInTime(s.departed_at, tz) : 'Not yet'}</p>
            </li>
          );
        })}
      </ol>
      <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        {d.carrier.legal_name} · MC {d.carrier.mc_number} · USDOT {d.carrier.usdot_number}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  );
}
