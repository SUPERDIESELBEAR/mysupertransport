import { classifyReferenceLabel, labelKey } from '@/lib/referenceClasses';

/**
 * One-off repair plan for `load_references` rows written BEFORE the
 * `unclassified` class existed.
 *
 * Those rows carry `reference_class = 'other'` for a printed label that the
 * classifier now places in `unclassified`. `buildRevisionDiff` keys on
 * class + value, so the stored row no longer matches the incoming one: the
 * review shows a pre-accepted add and an unaccepted remove for the SAME number,
 * and the upsert key (load_id, reference_class, value_key) inserts a second row
 * instead of updating the first.
 *
 * THE TRAP, and the reason this is a script rather than SQL: the create path
 * stores `COALESCE(NULLIF(label,''), reference_class)`, so a reference with NO
 * printed label at all lands with `label = 'other'`. Those rows are correctly
 * `other` — an ABSENT label is a different thing from an UNRECOGNISED one — and
 * reclassifying them would destroy the distinction the class exists to draw.
 *
 * The classification rule is not reimplemented here. `classifyReferenceLabel` is
 * imported, so the prefix fallback and `labelKey`'s normalization are the real
 * ones. A second copy of a classification rule is how two copies drift apart.
 */

export interface BackfillRow {
  id: string;
  load_id: string;
  reference_class: string;
  label: string | null;
  value: string;
  value_key: string;
  created_at: string;
  /** Number of `load_reference_citations` rows pointing at this reference. */
  citation_count: number;
}

export interface ReclassifyAction {
  id: string;
  load_id: string;
  from_reference_class: string;
  to_reference_class: 'unclassified';
  label: string;
  value: string;
}

export interface DeleteAction {
  id: string;
  load_id: string;
  reference_class: string;
  label: string | null;
  value: string;
  value_key: string;
  /** The row kept in its place. */
  kept_id: string;
}

export interface BackfillPlan {
  reclassify: ReclassifyAction[];
  /** Duplicate rows collapsed after reclassification. */
  remove: DeleteAction[];
  /** Rows left alone because their label is the no-printed-label sentinel. */
  sentinelsLeftAlone: number;
}

/** True for a row stored as `other` whose label is the "no label printed" sentinel. */
const isNoLabelSentinel = (row: BackfillRow): boolean => {
  const label = (row.label ?? '').trim();
  return !label || label === row.reference_class;
};

export function planReferenceBackfill(rows: BackfillRow[]): BackfillPlan {
  const reclassify: ReclassifyAction[] = [];
  let sentinelsLeftAlone = 0;

  const classOf = new Map<string, string>();
  rows.forEach(row => {
    classOf.set(row.id, row.reference_class);
    if (row.reference_class !== 'other') return;
    if (isNoLabelSentinel(row)) { sentinelsLeftAlone += 1; return; }
    if (classifyReferenceLabel(row.label) !== 'unclassified') return;
    // Belt and braces: a label that normalizes to nothing (`###`) is not a
    // printed label the map could ever learn.
    if (!labelKey(row.label)) { sentinelsLeftAlone += 1; return; }
    classOf.set(row.id, 'unclassified');
    reclassify.push({
      id: row.id,
      load_id: row.load_id,
      from_reference_class: 'other',
      to_reference_class: 'unclassified',
      label: (row.label ?? '').trim(),
      value: row.value,
    });
  });

  // Dedupe on the classes as they will stand AFTER the reclassification: a
  // pre-existing `unclassified` row and a just-reclassified `other` row are now
  // the same identity and only one may survive.
  const remove: DeleteAction[] = [];
  const groups = new Map<string, BackfillRow[]>();
  rows.forEach(row => {
    const key = `${row.load_id}|${classOf.get(row.id)}|${row.value_key}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  groups.forEach(group => {
    if (group.length < 2) return;
    // Richer citation set wins; on a tie the older row, so the original
    // created_at and its provenance survive.
    const ranked = [...group].sort((a, b) =>
      b.citation_count - a.citation_count
      || a.created_at.localeCompare(b.created_at)
      || a.id.localeCompare(b.id));
    const [keep, ...rest] = ranked;
    rest.forEach(row => remove.push({
      id: row.id,
      load_id: row.load_id,
      reference_class: row.reference_class,
      label: row.label,
      value: row.value,
      value_key: row.value_key,
      kept_id: keep.id,
    }));
  });

  return { reclassify, remove, sentinelsLeftAlone };
}

export const BACKFILL_REASON =
  'Backfill 20260827_reference_unclassified: duplicate reference collapsed after '
  + 'reclassifying a stored `other` row whose printed label now classifies as `unclassified`.';

/** The `load_change_history` row recorded for a collapsed duplicate. */
export const backfillHistoryRow = (action: DeleteAction) => ({
  load_id: action.load_id,
  field_path: `references.${action.reference_class}.${action.value_key}`,
  previous_value: `${action.label ?? action.reference_class}: ${action.value}`,
  new_value: null,
  is_financial: false,
  reason: BACKFILL_REASON,
  change_source: 'migration',
});
