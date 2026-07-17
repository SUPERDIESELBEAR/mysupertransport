/**
 * Per-driver / per-application rollup: collapse >= 2 notifications for the
 * same entity within a 24h window into a single thread card. The most-recent
 * notification wins for sort order and the visible summary.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RollupSourceNotif {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  sent_at: string;
  [k: string]: any;
}

export interface RollupGroup<T extends RollupSourceNotif> {
  key: string;
  entity_type: string;
  entity_id: string;
  head: T;
  members: T[];
}

export type FeedItem<T extends RollupSourceNotif> =
  | { kind: 'single'; notif: T }
  | { kind: 'group'; group: RollupGroup<T> };

/**
 * Group input notifications (already sorted newest-first) by entity within
 * a rolling 24h window. Single events stay as `single`; 2+ collapse to a
 * `group`. Groupable entity types: 'operator', 'application'.
 */
export function rollup<T extends RollupSourceNotif>(rows: T[]): FeedItem<T>[] {
  const buckets = new Map<string, T[]>();
  const singles: T[] = [];

  for (const r of rows) {
    const et = r.entity_type;
    const id = r.entity_id;
    if (!et || !id || (et !== 'operator' && et !== 'application')) {
      singles.push(r);
      continue;
    }
    const key = `${et}:${id}`;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }

  const items: Array<{ sortKey: number; item: FeedItem<T> }> = [];

  for (const [key, arr] of buckets) {
    arr.sort((a, b) => +new Date(b.sent_at) - +new Date(a.sent_at));
    const head = arr[0];
    const headTime = +new Date(head.sent_at);
    const members = arr.filter(r => headTime - +new Date(r.sent_at) <= WINDOW_MS);
    const stragglers = arr.filter(r => headTime - +new Date(r.sent_at) > WINDOW_MS);

    if (members.length >= 2) {
      items.push({
        sortKey: headTime,
        item: {
          kind: 'group',
          group: {
            key,
            entity_type: head.entity_type as string,
            entity_id: head.entity_id as string,
            head,
            members,
          },
        },
      });
    } else {
      for (const m of members) items.push({ sortKey: +new Date(m.sent_at), item: { kind: 'single', notif: m } });
    }
    for (const s of stragglers) items.push({ sortKey: +new Date(s.sent_at), item: { kind: 'single', notif: s } });
  }

  for (const s of singles) items.push({ sortKey: +new Date(s.sent_at), item: { kind: 'single', notif: s } });

  items.sort((a, b) => b.sortKey - a.sortKey);
  return items.map(x => x.item);
}
