/**
 * Amendment chains, resolved once.
 *
 * A record of duty status can be amended, and an amendment can itself be
 * amended: original <- A1 <- A2. A one-level walk of `supersedes_day_id`
 * (build a map of superseded -> replacement and read it once) is the defect
 * this module exists to remove — on a three-deep chain it either omits the
 * middle version or emits the versions out of order, and both the management
 * log panel and the retention export would then show an auditor an incomplete
 * history of a federal record.
 *
 * Every caller — the retention export, the management log panel, and the demo
 * reset's purge ordering — reads the chain from here, so display and export
 * cannot diverge.
 *
 * No imports. Runs unchanged in Deno and in the browser.
 */

export interface ChainRow {
  id: string;
  log_date: string;
  supersedes_day_id: string | null;
}

/** Raised when the rows describe a cycle rather than a chain. */
export class AmendmentChainCycleError extends Error {
  readonly ids: string[];
  constructor(ids: string[]) {
    super(
      `Duty-status amendment chain contains a cycle: no unreferenced version among ${ids.join(', ')}.`,
    );
    this.name = 'AmendmentChainCycleError';
    this.ids = ids;
  }
}

/**
 * Order one date's versions, original first, newest last.
 *
 * A "root" is a row whose `supersedes_day_id` is null OR points at a row that
 * is not in the input — the second case matters whenever the caller loaded a
 * date range and the original fell outside it. Dropping those rows would hide
 * versions; treating them as roots keeps every version visible.
 *
 * Branches (two amendments claiming the same parent, which the schema does not
 * forbid) are emitted deterministically: the branch is walked in id order and
 * every version still appears exactly once.
 */
export function orderVersions<T extends ChainRow>(rows: readonly T[]): T[] {
  if (rows.length === 0) return [];

  const byId = new Map<string, T>();
  for (const r of rows) byId.set(r.id, r);

  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of rows) {
    const parent = r.supersedes_day_id;
    if (parent && byId.has(parent)) {
      const list = children.get(parent);
      if (list) list.push(r);
      else children.set(parent, [r]);
    } else {
      roots.push(r);
    }
  }
  for (const list of children.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  roots.sort((a, b) => a.id.localeCompare(b.id));

  const out: T[] = [];
  const seen = new Set<string>();
  const walk = (row: T): void => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
    for (const child of children.get(row.id) ?? []) walk(child);
  };
  for (const root of roots) walk(root);

  // Every row unreferenced by the walk is inside a cycle: original <- A1 <- A2
  // <- A1 has no root, so nothing would be emitted and a silent empty chain is
  // exactly the failure this module refuses to produce.
  if (out.length !== rows.length) {
    throw new AmendmentChainCycleError(rows.filter((r) => !seen.has(r.id)).map((r) => r.id));
  }
  return out;
}

/**
 * Group by `log_date`, each group ordered original-first, dates ascending.
 * The shape both the export and the log panel render from.
 */
export function orderVersionsByDate<T extends ChainRow>(
  rows: readonly T[],
): Array<{ log_date: string; versions: T[] }> {
  const byDate = new Map<string, T[]>();
  for (const r of rows) {
    const list = byDate.get(r.log_date);
    if (list) list.push(r);
    else byDate.set(r.log_date, [r]);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([log_date, group]) => ({ log_date, versions: orderVersions(group) }));
}

/**
 * Rows nothing else supersedes — the only rows that can be deleted without
 * hitting a foreign key. Purge these, re-query, repeat: the fixpoint loop the
 * demo reset runs. `supersedes_day_id IS NOT NULL` is the one-level thinking
 * that gets this wrong, since it is true for both amendments in a chain.
 */
export function purgeLeaves<T extends ChainRow>(rows: readonly T[]): T[] {
  if (rows.length === 0) return [];
  const superseded = new Set<string>();
  for (const r of rows) if (r.supersedes_day_id) superseded.add(r.supersedes_day_id);
  const leaves = rows.filter((r) => !superseded.has(r.id));
  if (leaves.length === 0) throw new AmendmentChainCycleError(rows.map((r) => r.id));
  return [...leaves];
}
