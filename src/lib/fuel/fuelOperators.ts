/**
 * THE DRIVER LIST THE FUEL SCREENS PICK FROM.
 *
 * `operators.user_id` points at `auth.users`, not at `public.profiles`, so
 * PostgREST cannot embed the name — the whole request would return nothing.
 * Names come from the second read in `src/lib/profileNames.ts`. Lifted out of
 * `FuelImportPage` when the per-driver detail screen needed the same list, so
 * there is one definition of "the drivers a fuel screen can pick from".
 *
 * THE UNIT IS RESOLVED, NOT READ. This list used to take `operators.unit_number`
 * at face value, which is why 48 of 60 active drivers appeared to have no unit
 * and printed a blank fuel PDF header while the matcher, reading onboarding
 * first, had the number all along. `resolveOperatorUnit` is now the only thing
 * that answers the question, here and everywhere else.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';
import { fetchOperatorUnits, resolveOperatorUnit } from './operatorUnit';
import { fetchDriverSetupStatus, isSetUpDriver } from './setupDriverFilter';

export interface OperatorOption { id: string; name: string; unit: string | null }

const OPERATOR_SELECT = 'id, unit_number, user_id';

interface OperatorRow { id: string; unit_number: string | null; user_id: string | null }

export async function fetchOperatorOptions(): Promise<OperatorOption[]> {
  const { data, error } = await supabase
    .from('operators')
    .select(OPERATOR_SELECT)
    .eq('is_active', true)
    .limit(500)
    .returns<OperatorRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const [names, units] = await Promise.all([
    fetchProfileNames(rows.map((o) => o.user_id)),
    fetchOperatorUnits(rows.map((o) => o.id)),
  ]);
  return rows
    .map((o) => ({
      id: o.id,
      name: formatProfileName(o.user_id ? names.get(o.user_id) : null, 'Unnamed driver'),
      unit: resolveOperatorUnit(units.get(o.id) ?? null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * THE SAME LIST, NARROWED TO DRIVERS WHO ARE ACTUALLY SET UP.
 *
 * `is_active` alone includes applicants and half-finished onboarding records —
 * Christopher Harris and four others turned up in the Driver Fuel Detail picker
 * for exactly that reason. The five-condition rule lives in
 * `setupDriverFilter.ts` and is not restated here; this is the fuel screens'
 * way of asking it. A screen that legitimately needs unfinished drivers (a
 * compliance or onboarding view) keeps using `fetchOperatorOptions`.
 */
export async function fetchSetUpOperatorOptions(): Promise<OperatorOption[]> {
  const all = await fetchOperatorOptions();
  const status = await fetchDriverSetupStatus(all.map(o => o.id));
  return all.filter(o => isSetUpDriver(status.get(o.id)));
}

/** `Unit 260 · Ali Mohamed`, or just the name when no unit is recorded. */
export function operatorLabel(o: OperatorOption): string {
  return o.unit ? `Unit ${o.unit} · ${o.name}` : o.name;
}
