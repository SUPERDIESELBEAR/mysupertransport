/**
 * ONE DEFINITION OF "THESE TWO DRIVERS SHARE A PLATE".
 *
 * Vehicle Hub already flagged shared plates on the card; the Duplicate Plates
 * screen decides what to do about them. Two readers of the same question is
 * how the deactivated-driver defect happened, so the grouping lives here and
 * both screens call it.
 */

export interface PlateHolder {
  operatorId: string;
  driverName: string;
  unitNumber: string | null;
  truckYear?: string | null;
  truckMake?: string | null;
  truckVin?: string | null;
  truckPlate: string | null;
  truckPlateState: string | null;
  isActive: boolean;
}

/** mixed = one or more off the roster; both_active = every holder is active. */
export type PlateGroupKind = 'mixed' | 'both_active' | 'all_deactivated';

export interface PlateGroup {
  /** Normalised plate+state key. */
  key: string;
  /** The plate as typed on the first holder, for display. */
  plate: string;
  plateState: string | null;
  holders: PlateHolder[];
  kind: PlateGroupKind;
}

/** Uppercase, strip anything that is not a letter or digit. */
export function normalizePlate(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function plateKey(
  plate: string | null | undefined,
  state: string | null | undefined,
): string {
  return `${normalizePlate(plate)}|${normalizePlate(state)}`;
}

function classify(holders: PlateHolder[]): PlateGroupKind {
  const active = holders.filter(h => h.isActive).length;
  if (active === holders.length) return 'both_active';
  if (active === 0) return 'all_deactivated';
  return 'mixed';
}

const KIND_ORDER: Record<PlateGroupKind, number> = {
  mixed: 0,
  both_active: 1,
  all_deactivated: 2,
};

/**
 * Every plate held by more than one driver, ordered so the cases that most
 * likely need a decision come first. Holders with no plate at all are skipped.
 */
export function groupSharedPlates(holders: PlateHolder[]): PlateGroup[] {
  const byKey = new Map<string, PlateHolder[]>();

  holders.forEach(h => {
    if (!normalizePlate(h.truckPlate)) return;
    const key = plateKey(h.truckPlate, h.truckPlateState);
    const list = byKey.get(key) ?? [];
    list.push(h);
    byKey.set(key, list);
  });

  const groups: PlateGroup[] = [];
  byKey.forEach((list, key) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => Number(b.isActive) - Number(a.isActive));
    groups.push({
      key,
      plate: (sorted[0].truckPlate ?? '').trim().toUpperCase(),
      plateState: (sorted[0].truckPlateState ?? '').trim().toUpperCase() || null,
      holders: sorted,
      kind: classify(sorted),
    });
  });

  return groups.sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (k !== 0) return k;
    if (b.holders.length !== a.holders.length) return b.holders.length - a.holders.length;
    return a.plate.localeCompare(b.plate);
  });
}

/** The other units on this driver's plate, phrased for a card. */
export function sharedPlateNote(
  row: Pick<PlateHolder, 'operatorId' | 'truckPlate' | 'truckPlateState'>,
  groups: PlateGroup[],
): string | null {
  const key = plateKey(row.truckPlate, row.truckPlateState);
  const group = groups.find(g => g.key === key);
  if (!group) return null;
  const others = group.holders.filter(h => h.operatorId !== row.operatorId);
  if (others.length === 0) return null;
  return `Plate also on ${others
    .map(o => `Unit ${o.unitNumber ?? '—'} — ${o.isActive ? 'active' : 'deactivated'}`)
    .join(', ')}`;
}
