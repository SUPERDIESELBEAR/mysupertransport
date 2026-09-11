import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  diagnoseUnitConflict,
  fetchOperatorUnits,
  type UnitConflict,
} from '@/lib/fuel/operatorUnit';

/**
 * Shown on the driver's own record, where someone is already working on the
 * unit number. It reports the disagreement and NEVER resolves it: both values
 * are named, the one the system is using is named, and the fix is made at the
 * source by a person who knows which was entered in error.
 *
 * A per-driver flag rather than a Management list because the live count of
 * disagreements is zero — there is no list to build.
 */
export function UnitNumberConflictAlert({
  operatorId,
  onboardingUnit,
}: {
  operatorId: string | null | undefined;
  /** Latest unsaved/saved onboarding value from the surrounding form, if any. */
  onboardingUnit?: string | null;
}) {
  const [conflict, setConflict] = useState<UnitConflict | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!operatorId) { setConflict(null); return; }
    fetchOperatorUnits([operatorId])
      .then(map => {
        if (cancelled) return;
        const values = map.get(operatorId) ?? null;
        if (!values) { setConflict(null); return; }
        setConflict(diagnoseUnitConflict({
          onboardingUnit: onboardingUnit !== undefined ? onboardingUnit : values.onboardingUnit,
          operatorUnit: values.operatorUnit,
        }));
      })
      .catch(() => { if (!cancelled) setConflict(null); });
    return () => { cancelled = true; };
  }, [operatorId, onboardingUnit]);

  if (!conflict?.conflict) return null;

  const usedLabel = conflict.usedSource === 'onboarding'
    ? 'the onboarding record'
    : 'the driver record';

  return (
    <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="space-y-1">
        <p className="font-semibold text-destructive">This driver has two different unit numbers on file</p>
        <p className="text-muted-foreground">
          Onboarding record: <span className="font-semibold text-foreground">{conflict.onboardingUnit}</span>
          {' · '}
          Driver record: <span className="font-semibold text-foreground">{conflict.operatorUnit}</span>
        </p>
        <p className="text-muted-foreground">
          The system is using <span className="font-semibold text-foreground">{conflict.usedUnit}</span> (from {usedLabel}),
          so the number in use may not be the one last typed. Correct whichever value is wrong at its source —
          nothing is changed automatically.
        </p>
      </div>
    </div>
  );
}
