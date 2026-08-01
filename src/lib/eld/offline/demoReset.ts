/**
 * Device-side honouring of a demo reset.
 *
 * `reset-demo-driver` purges the server side and stamps `operators.demo_reset_at`.
 * Without this, the device keeps every cached day, PDF, signature and queue
 * entry the demo session created, and the next roadside render serves records
 * the office no longer has.
 *
 * SAFETY — the gate is `is_demo`, not the timestamp. The clear drops the day,
 * meta and queue stores, which for a real operator would destroy a locally
 * certified day and its unsynced bytes: the only copy that exists. A stray or
 * hand-edited `demo_reset_at` on a real operator must therefore be inert. Both
 * conditions must hold, and `is_demo` is read from the freshly fetched server
 * row — never inferred from the cache, and never assumed on a failed fetch.
 */
import { roadsideDb, readLocalMeta } from './db';

export type DemoResetOutcome =
  | 'not_demo'        // gate refused: operator is not a demo operator
  | 'no_stamp'        // demo, but the server has never reset this operator
  | 'already_applied' // stamp is not newer than the one this device holds
  | 'deferred'        // work is on the wire; retry on the next hydrate
  | 'wiped';

/** How long to wait for an active drain to quiesce before deferring. */
const QUIESCE_TIMEOUT_MS = 8_000;
const QUIESCE_POLL_MS = 400;

async function inFlightCount(): Promise<number> {
  try {
    return await roadsideDb.sync_queue.where('status').equals('in_flight').count();
  } catch {
    return 0;
  }
}

/**
 * A `certify_rods_day` entry marked `in_flight` is already on the wire. If the
 * stores are dropped underneath it the write still lands and the device forgets
 * it ever queued it. For a demo operator that is harmless — the server rows are
 * being purged in the same breath — but rather than rely on that, wait for the
 * drain to settle and defer if it does not. Settling a vanished entry is itself
 * safe: every terminal marker in queue/store.ts uses Dexie `update()`, which
 * no-ops on a missing key instead of resurrecting the row.
 */
async function waitForQuiesce(now: () => number = Date.now): Promise<boolean> {
  const deadline = now() + QUIESCE_TIMEOUT_MS;
  while (now() < deadline) {
    if ((await inFlightCount()) === 0) return true;
    await new Promise((r) => setTimeout(r, QUIESCE_POLL_MS));
  }
  return (await inFlightCount()) === 0;
}

export interface DemoResetInput {
  operatorId: string;
  /** From the freshly fetched `operators` row. Anything but `true` refuses. */
  isDemo: boolean | null | undefined;
  /** `operators.demo_reset_at`. */
  demoResetAt: string | null | undefined;
}

/**
 * Clears the offline stores when — and only when — a demo operator has been
 * reset server-side since this device last looked.
 */
export async function maybeWipeForDemoReset(
  input: DemoResetInput,
): Promise<DemoResetOutcome> {
  if (input.isDemo !== true) return 'not_demo';
  if (!input.demoResetAt) return 'no_stamp';

  const meta = await readLocalMeta();
  // A cache belonging to a different operator is not this operator's to judge;
  // hydration replaces it wholesale anyway.
  if (meta && meta.operator_id !== input.operatorId) return 'already_applied';

  const seen = meta?.demo_reset_at ?? null;
  if (seen && Date.parse(seen) >= Date.parse(input.demoResetAt)) return 'already_applied';

  if (!(await waitForQuiesce())) return 'deferred';

  await wipeStores();
  // Re-stamp immediately so a hydration failure later in the same run cannot
  // make the device wipe again on every load.
  await roadsideDb.local_meta.put({
    key: 'identity',
    operator_id: input.operatorId,
    driver_name: meta?.driver_name ?? '',
    driver_user_id: meta?.driver_user_id ?? null,
    truck_number: null,
    carrier_name: '', carrier_usdot: '', carrier_mc: '',
    carrier_main_office_address: '', carrier_home_terminal_address: '',
    carrier_home_terminal_timezone: '', carrier_fmcsa_division_state: '',
    carrier_cached_at: null,
    home_terminal_address: null,
    home_terminal_timezone: meta?.home_terminal_timezone ?? 'America/Chicago',
    is_demo: true,
    demo_reset_at: input.demoResetAt,
    updated_at: new Date().toISOString(),
  });
  return 'wiped';
}

/**
 * Stores-only clear. Never a Dexie version bump and never called from an
 * upgrade — the "additive upgrades only" invariant in db.ts still holds.
 */
async function wipeStores(): Promise<void> {
  await Promise.all([
    roadsideDb.rods_pdfs.clear(),
    roadsideDb.rods_documents.clear(),
    roadsideDb.notice_pdfs.clear(),
    roadsideDb.signature_images.clear(),
    roadsideDb.roadside_manifest.clear(),
    roadsideDb.rods_days_cache.clear(),
    roadsideDb.rods_events_cache.clear(),
    roadsideDb.pending_mutations.clear(),
    roadsideDb.sync_queue.clear(),
    roadsideDb.merged_packets.clear(),
    roadsideDb.rods_divergences.clear(),
    roadsideDb.local_meta.clear(),
  ]);
}
