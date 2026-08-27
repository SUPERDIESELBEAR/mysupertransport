/**
 * One definition of what the rate con inbox contains.
 *
 * The duplicate rule used to live in three separate places (the fetch filter,
 * the badge branch in the row renderer, and — by omission — the render filter),
 * and they disagreed: the fetch deliberately kept auto-collapsed duplicates,
 * then the render filter dropped them on the floor, so a collapsed duplicate
 * was indistinguishable from mail that never arrived. Every site now calls the
 * helpers here.
 */

export type InboxRowShape = {
  status: string;
  dismissed_by?: string | null;
  dismiss_reason?: string | null;
};

/** Statuses that represent work a dispatcher still has in front of them. */
export const OPEN_STATUSES = ['received', 'pending_parse', 'parsed', 'needs_manual'] as const;

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * A duplicate the SYSTEM collapsed on its own: dismissed with no human
 * attributed to the dismissal and a reason the ingest function wrote. A row a
 * dispatcher dismissed by hand has dismissed_by set and is NOT this.
 */
export function isAutoCollapsedDuplicate(row: InboxRowShape): boolean {
  return row.status === 'dismissed'
    && !row.dismissed_by
    && /^duplicate/i.test(row.dismiss_reason ?? '');
}

/**
 * What the default (Show handled OFF) view renders: open work plus the record
 * that a duplicate arrived and was recognised. Note 'dismissed' is NOT an open
 * status — adding it would surface every manually dismissed row too.
 */
export function isDefaultVisible(row: InboxRowShape): boolean {
  return isOpenStatus(row.status) || isAutoCollapsedDuplicate(row);
}

/**
 * What the nav badge counts. A badge is a call to action; a collapsed
 * duplicate needs none, so it renders in the list but never adds to the count.
 * The two agree because both are derived from this file.
 */
export function countsTowardBadge(row: InboxRowShape): boolean {
  return isOpenStatus(row.status) && !isAutoCollapsedDuplicate(row);
}
