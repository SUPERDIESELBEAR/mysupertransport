/**
 * WHO APPEARS IN THE FUEL DISCOUNT DRIVER EXCEPTIONS LIST.
 *
 * The list used to be every `is_active` operator — 60 rows, including
 * applicants and half-finished onboarding records nobody has a pay
 * arrangement with. This narrows it to drivers who are actually SET UP.
 *
 * THE RULE (owner, 2026-09-11): active, not demo, fully onboarded, with a
 * go-live date and an insurance date. All five, or the row is not a driver
 * whose pay is arranged yet.
 *
 * `excluded_from_dispatch` IS DELIBERATELY NOT PART OF IT. It would cut the
 * list from 46 to 35 by removing fully onboarded drivers who are off dispatch
 * for a truck repair or a lapsed medical. Such a driver still HAS a pay
 * arrangement. This list answers "who is set up as a driver", not "who is
 * hauling this week". Do not add the flag for tidiness.
 *
 * REJECTED: filtering by unit number, the owner's first suggestion. It happens
 * to exclude the right 12 today, but Daniel Vazquez Gonzalez and Jonathan Grant
 * hold units while being unonboarded with no go-live, no insurance and no
 * dispatch record — so it would leave two unfinished drivers visible while
 * appearing to work. A unit is a proxy for being set up, not the thing itself.
 *
 * A DRIVER WITH A SETTING ALWAYS APPEARS, filter or no filter. A pay setting
 * that exists and cannot be seen is worse than clutter. Those rows come back
 * marked, never hidden.
 *
 * THIS IS A DISPLAY FILTER ON A SETTINGS SCREEN. The settlement engine's
 * resolution order is untouched: an unonboarded driver with an override still
 * has it honoured if he ever settles.
 */
import { supabase } from '@/integrations/supabase/client';

export interface DriverSetupStatus {
  isActive: boolean;
  isDemo: boolean;
  fullyOnboarded: boolean;
  goLiveDate: string | null;
  insuranceAddedDate: string | null;
}

/** All five conditions, or false. A missing status row is not set up. */
export function isSetUpDriver(s: DriverSetupStatus | null | undefined): boolean {
  if (!s) return false;
  return (
    s.isActive
    && !s.isDemo
    && s.fullyOnboarded
    && Boolean(s.goLiveDate)
    && Boolean(s.insuranceAddedDate)
  );
}

/**
 * The rows the exceptions list shows: set-up drivers, plus anyone carrying a
 * deliberate setting, the latter marked `offList`.
 */
export function selectExceptionListRows<T extends { id: string }>(
  rows: T[],
  status: Map<string, DriverSetupStatus>,
  hasSetting: (id: string) => boolean,
): (T & { offList: boolean })[] {
  return rows
    .map(r => ({ ...r, offList: !isSetUpDriver(status.get(r.id)) }))
    .filter(r => !r.offList || hasSetting(r.id));
}

/** The five fields, for a set of drivers, in two reads. */
export async function fetchDriverSetupStatus(
  operatorIds: string[],
): Promise<Map<string, DriverSetupStatus>> {
  const ids = [...new Set(operatorIds.filter(Boolean))];
  const out = new Map<string, DriverSetupStatus>();
  if (ids.length === 0) return out;

  const [ops, onb] = await Promise.all([
    supabase.from('operators').select('id, is_active, is_demo').in('id', ids),
    supabase.from('onboarding_status')
      .select('operator_id, fully_onboarded, go_live_date, insurance_added_date')
      .in('operator_id', ids),
  ]);
  if (ops.error) throw ops.error;
  if (onb.error) throw onb.error;

  const byOperator = new Map(
    (onb.data ?? [])
      .filter(r => r.operator_id)
      .map(r => [r.operator_id as string, r]),
  );
  for (const o of ops.data ?? []) {
    const s = byOperator.get(o.id);
    out.set(o.id, {
      isActive: Boolean(o.is_active),
      isDemo: Boolean(o.is_demo),
      fullyOnboarded: Boolean(s?.fully_onboarded),
      goLiveDate: s?.go_live_date ?? null,
      insuranceAddedDate: s?.insurance_added_date ?? null,
    });
  }
  return out;
}
