/**
 * Driver home model. PURE — no supabase, no React.
 *
 * Go-live at SUPERTRANSPORT is triggered by INSURANCE, not by finishing
 * onboarding. A driver starts hauling immediately, on temporary decals, running
 * paper logs, while working his way toward the Pleasant Hill terminal for
 * USDOT numbers, logo, ELD and dash cam install. Onboarding and driving are
 * therefore CONCURRENT, usually for about a week. Home shows both at once.
 * There is no mode switch and there must never be one.
 *
 * Chain membership is NOT re-derived here. src/lib/dispatchBoard.ts owns the
 * driving-work vs office-work split; this module reads its output.
 */
import { CARRIER_TIMEZONE, carrierZoneAbbrev } from '@/lib/carrierTimezone';
import { getOnboardingStages } from '@/lib/onboardingProgress';

export interface HomeStop {
  /** Present so the driver can write his own check-in against the stop. */
  id?: string;
  stop_sequence: number | null;
  stop_type: string | null;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  appointment_start: string | null;
  appointment_end: string | null;
  actual_arrival_at?: string | null;
  actual_departure_at: string | null;
  arrival_source?: string | null;
  departure_source?: string | null;
}

/**
 * The stop the driver is heading to: the first stop in sequence he has not yet
 * departed. Falls back to the last stop once everything has been departed, so
 * the card never goes blank mid-load.
 */
export function nextStop(stops: HomeStop[]): HomeStop | null {
  const ordered = (stops ?? []).slice().sort(
    (a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0),
  );
  if (ordered.length === 0) return null;
  return ordered.find(s => !s.actual_departure_at) ?? ordered[ordered.length - 1];
}

const dayFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: CARRIER_TIMEZONE,
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: CARRIER_TIMEZONE,
});

const valid = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Appointment window on one line, in the carrier timezone, always carrying the
 * zone abbreviation for the date — never a machine-local reading.
 */
export function formatCarrierWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = valid(start);
  const e = valid(end);
  if (!s && !e) return 'No appointment set';
  if (s && e) {
    const sameDay = dayFmt.format(s) === dayFmt.format(e);
    return sameDay
      ? `${dayFmt.format(s)} · ${timeFmt.format(s)} – ${timeFmt.format(e)} ${carrierZoneAbbrev(e)}`
      : `${dayFmt.format(s)} ${timeFmt.format(s)} – ${dayFmt.format(e)} ${timeFmt.format(e)} ${carrierZoneAbbrev(e)}`;
  }
  const only = (s ?? e)!;
  return `${dayFmt.format(only)} · ${timeFmt.format(only)} ${carrierZoneAbbrev(only)}`;
}

/** Short carrier-time day + time, used for the quiet "what's next" line. */
export function formatCarrierMoment(value: string | null | undefined): string {
  const d = valid(value);
  if (!d) return 'time to be confirmed';
  return `${dayFmt.format(d)} · ${timeFmt.format(d)} ${carrierZoneAbbrev(d)}`;
}

/**
 * ELD installation is outstanding until the unit is actually installed (or the
 * driver is exempt). A paper-logbook allowance is exactly the window this
 * matters in, so it does NOT count as installed here.
 */
export function isEldInstallOutstanding(status: Record<string, unknown> | null | undefined): boolean {
  const s = status ?? {};
  if (s.eld_exempt === true) return false;
  return s.eld_installed !== 'yes';
}

/** Insurance-triggered go-live. */
export function isLive(status: Record<string, unknown> | null | undefined): boolean {
  return !!(status ?? {}).go_live_date;
}

export interface StillNeededItem {
  /** Stage the item belongs to, for the quiet grouping label. */
  stage: string;
  label: string;
}

/**
 * Everything still outstanding in onboarding, flattened.
 *
 * Shown whenever anything is outstanding, INCLUDING while the driver is live
 * and hauling. Drivers go live with plates pending and inspections due; if
 * those vanished at go-live they would go unfinished and invisible.
 * Absent entirely when nothing is outstanding.
 */
export function stillNeededItems(
  status: Record<string, unknown> | null | undefined,
  paySetup?: unknown,
): StillNeededItem[] {
  const out: StillNeededItem[] = [];
  for (const stage of getOnboardingStages(status ?? {}, paySetup)) {
    if (stage.complete || stage.notApplicable) continue;
    for (const item of stage.items) {
      if (!item.done) out.push({ stage: stage.fullName, label: item.label });
    }
  }
  return out;
}
