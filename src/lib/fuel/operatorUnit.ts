/**
 * ONE ANSWER TO "WHAT IS THIS DRIVER'S UNIT NUMBER".
 *
 * A unit number can be recorded in two places: `onboarding_status.unit_number`
 * and `operators.unit_number`. Until 2026-09-09 the readers disagreed about
 * which to consult. `fuel_resolve_card` resolved onboarding-then-operator; the
 * management driver detail screen, the fuel PDF and the fuel import driver
 * picker read the operator record alone.
 *
 * Ali Mohamed is what that costs. Onboarding holds 260, the operator record is
 * empty, and MultiService prints 260. So the matcher compared 260 against 260
 * and correctly reported no disagreement, WHILE the PDF printed a blank unit in
 * its header. Both readers were right about what each one read, and nothing in
 * the codebase could notice that they had read different things. 48 of 60
 * active drivers are in that same position.
 *
 * The rule now lives in exactly two places that are the same rule: this module,
 * and `public.operator_unit_number(text, text)` in the database, which
 * `fuel_resolve_card` calls. `fuelUnitSourceGuard.test.ts` refuses a third.
 *
 * THE ORDER IS PRESERVED, NOT ENDORSED. Onboarding-first prefers a
 * lifecycle-stage record over the durable one, which is backwards from how the
 * two are otherwise used, and it is how a stale onboarding value SHADOWS a
 * correct operator value. 48 drivers depend on that order today, so it is not
 * changed here — it is recorded as an open question in docs/tms-build-status.md.
 */
import { supabase } from '@/integrations/supabase/client';

/** The two places a unit number can be recorded, as read from the database. */
export interface OperatorUnitValues {
  onboardingUnit: string | null;
  operatorUnit: string | null;
}

/** Which record supplied the resolved value. `null` when there is none. */
export type OperatorUnitSource = 'onboarding' | 'operator' | null;

const clean = (v: string | null | undefined): string | null => {
  const t = String(v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * The driver's unit number, or null when neither record has one.
 * Mirrors `public.operator_unit_number(_onboarding_unit, _operator_unit)`
 * exactly: trim, treat empty as absent, onboarding first.
 */
export function resolveOperatorUnit(values: OperatorUnitValues | null): string | null {
  if (!values) return null;
  return clean(values.onboardingUnit) ?? clean(values.operatorUnit);
}

/** Which of the two records the resolved value came from. */
export function resolveOperatorUnitSource(values: OperatorUnitValues | null): OperatorUnitSource {
  if (!values) return null;
  if (clean(values.onboardingUnit) !== null) return 'onboarding';
  if (clean(values.operatorUnit) !== null) return 'operator';
  return null;
}

/**
 * Both unit columns for a set of drivers, in two reads.
 *
 * `operators` and `onboarding_status` are joined here rather than embedded,
 * because a driver with no onboarding row must still come back — that driver is
 * precisely the case the fill action exists for.
 */
export async function fetchOperatorUnits(
  operatorIds: string[],
): Promise<Map<string, OperatorUnitValues>> {
  const ids = [...new Set(operatorIds.filter(Boolean))];
  const out = new Map<string, OperatorUnitValues>();
  if (ids.length === 0) return out;

  const [ops, onb] = await Promise.all([
    supabase.from('operators').select('id, unit_number').in('id', ids),
    supabase.from('onboarding_status').select('operator_id, unit_number').in('operator_id', ids),
  ]);
  if (ops.error) throw ops.error;
  if (onb.error) throw onb.error;

  const onboardingById = new Map<string, string | null>();
  for (const r of onb.data ?? []) {
    if (r.operator_id) onboardingById.set(r.operator_id, r.unit_number ?? null);
  }
  for (const r of ops.data ?? []) {
    out.set(r.id, {
      onboardingUnit: onboardingById.get(r.id) ?? null,
      operatorUnit: r.unit_number ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The two-direction missing-unit comparison                           */
/* ------------------------------------------------------------------ */

/**
 * A MISSING VALUE IS NOT COMPARED TODAY, AND THAT IS THE GAP.
 *
 * `preview_fuel_import` raises a disagreement only when BOTH sides carry a
 * unit. An ABSENT unit therefore passes silently while a WRONG one flags —
 * absent and wrong are different, and only one was detected.
 *
 * Both directions occur and they need DIFFERENT fixes, so the verdict names
 * WHICH SYSTEM is missing the value. Without that, someone goes and corrects
 * the wrong one.
 */
export type UnitGap =
  /** Both sides agree, both sides are empty, or the row matched no driver. */
  | { kind: 'none' }
  /** The file carries a unit and SUPERDRIVE has none. The gap is OURS. */
  | { kind: 'ours'; fileUnit: string }
  /** SUPERDRIVE carries a unit and the file has none. The gap is THEIRS. */
  | { kind: 'theirs'; systemUnit: string };

/**
 * NEITHER SIDE HAS A UNIT: reported as `none`, deliberately.
 *
 * There is nothing to fill in from the file and nothing to correct in the
 * MultiService portal, so a flag here would be a row the reviewer cannot act
 * on — noise on the one screen whose whole value is that every flag has a fix.
 * A driver with no unit anywhere is a roster problem, not a fuel import
 * problem, and it is visible on the driver record where it can actually be
 * fixed. It is counted and reported separately, never flagged per row.
 */
export function diagnoseUnitGap(
  fileUnit: string | null | undefined,
  systemUnit: string | null | undefined,
): UnitGap {
  const file = clean(fileUnit);
  const system = clean(systemUnit);
  if (file !== null && system === null) return { kind: 'ours', fileUnit: file };
  if (system !== null && file === null) return { kind: 'theirs', systemUnit: system };
  return { kind: 'none' };
}

/**
 * The sentence shown on the row. It names the system that is missing the value
 * and, for the MultiService side, says plainly that fixing it there does not
 * change a file already downloaded.
 */
export function unitGapMessage(gap: UnitGap): string | null {
  switch (gap.kind) {
    case 'none':
      return null;
    case 'ours':
      return `File says unit ${gap.fileUnit}, SUPERDRIVE has no unit for this driver.`;
    case 'theirs':
      return `SUPERDRIVE says unit ${gap.systemUnit}, the file has no unit. `
        + 'The unit is missing in the MultiService portal, not here. Correcting it there '
        + 'does NOT change an export you have already downloaded — MultiService will not '
        + 'retroactively alter it, so a fresh export is needed for the file to show it.';
  }
}

/** A fill is offered only where the file has the value and we do not. */
export function unitGapOffersFill(gap: UnitGap): boolean {
  return gap.kind === 'ours';
}
