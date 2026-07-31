import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  CARRIER_CACHE_MISSING_MESSAGE, requireCachedCarrier, rodsDayCarrierSnapshot,
} from '@/lib/eld/carrierIdentity';
import { isShortPeriod } from '@/lib/eld/rodsValidation';
import {
  assertDeleteApplied, assertRowsAffected, isRowNotWritable, markDayStale,
} from '@/lib/eld/rodsWrite';
import { roadsideDb } from '@/lib/eld/offline/db';
import { putCachedDay, putCachedEvents } from '@/lib/eld/offline/cache';
import { enqueueCoalesced } from '@/lib/eld/offline/queue/store';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

export interface DraftSegment {
  id?: string;
  localId: string;
  start_minute: number;
  /** Null until the driver enters it. Never inferred from the next segment. */
  end_minute: number | null;
  duty_status: 1 | 2 | 3 | 4 | null;
  city: string;
  state: string;
  remarks: string;
}

/**
 * Outcome of pushing the debounced header edits to the row.
 *
 * `offline` is separated from failure on purpose: the edits are still held in
 * `pendingHeader` and will go out on the next flush, but certification must not
 * proceed, because the row it would lock does not yet carry them.
 */
/**
 * Outcome of pushing the debounced header edits.
 *
 * There is no longer an `offline` outcome. Draft writes are LOCAL-FIRST: the
 * flush writes the Dexie cache and hands the server write to the sync queue,
 * so it succeeds with or without a signal. Certification gates on the local
 * copy, which is the copy the queue will replay.
 */
export type HeaderFlushResult = 'saved' | 'nothing-pending' | 'locked';

/**
 * A flush that failed for a reason the driver has already been told about
 * (a filtered write, a server error). Thrown so callers stop, not so they
 * report it a second time.
 */
export class HeaderFlushHandledError extends Error {
  readonly handled = true;

  constructor() {
    super('Header edits could not be saved.');
    this.name = 'HeaderFlushHandledError';
  }
}

export function isHandledFlushError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { handled?: boolean }).handled === true;
}

/** The day is locked on this device by a certification the office has not confirmed. */
export const LOCAL_CERTIFIED_MESSAGE =
  'You signed this log on this device. It is waiting to reach the office and cannot be edited.';

function toDraft(e: RodsEvent): DraftSegment {
  return {
    id: e.id,
    localId: e.id,
    start_minute: e.start_minute,
    end_minute: e.end_minute,
    duty_status: e.duty_status,
    city: e.city ?? '',
    state: e.state ?? '',
    remarks: e.remarks ?? '',
  };
}

function toEventRow(dayId: string, s: DraftSegment): RodsEvent {
  return {
    id: s.id ?? s.localId,
    rods_day_id: dayId,
    start_minute: s.start_minute,
    end_minute: s.end_minute,
    duty_status: s.duty_status,
    city: s.city.trim() || null,
    state: s.state.trim().toUpperCase() || null,
    remarks: s.remarks.trim() || null,
    is_short_period: isShortPeriod(s.start_minute, s.end_minute),
  } as unknown as RodsEvent;
}

let localCounter = 0;
export function newLocalId() {
  localCounter += 1;
  return `local-${localCounter}-${Date.now()}`;
}

/**
 * Loads (or creates) the draft day for a date and keeps its header + segments.
 * Header edits autosave; segments are written on demand.
 */
export function useRodsDay(params: {
  operatorId: string | null | undefined;
  logDate: string;
  defaults?: Partial<RodsDay>;
  /** Create the draft row automatically when the date has no record yet. */
  autoCreate?: boolean;
  isReconstruction?: boolean;
}) {
  const { operatorId, logDate, defaults, autoCreate, isReconstruction } = params;
  const [day, setDay] = useState<RodsDay | null>(null);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Header edits made since the last flush, merged across fields. */
  const pendingHeader = useRef<Partial<RodsDay>>({});
  /** Monotonic per-day, mirrored into the cache and the queue entry. */
  const version = useRef(0);
  /** Non-null once the driver has signed on this device. Blocks every edit. */
  const localCertifiedAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);

    // CACHE FIRST. For an uncertified day the device is the source of truth:
    // the driver's edits live here and the queue replays them later, so a
    // server read that came back stale (or came back at all, after edits that
    // have not drained) would show the driver an older version of their own
    // log. A synced, server-confirmed cache entry is equally safe to use.
    const cached = await roadsideDb.rods_days_cache.get(logDate).catch(() => undefined);
    const cacheIsAuthoritative = !!cached
      && cached.operator_id === operatorId
      && (cached.unsynced || !!cached.local_certified_at);

    let target: RodsDay | null = null;

    if (cacheIsAuthoritative && cached) {
      target = cached.day;
      version.current = cached.version;
      localCertifiedAt.current = cached.local_certified_at;
      const cachedEvents = await roadsideDb.rods_events_cache.get(cached.day.id).catch(() => undefined);
      setDay(target);
      setSegments((cachedEvents?.events ?? []).map(toDraft));
      setLoading(false);
      return;
    }

    localCertifiedAt.current = null;
    version.current = cached?.version ?? 0;

    const { data: rows, error: readErr } = await supabase
      .from('rods_days')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('log_date', logDate)
      .neq('status', 'superseded')
      .order('created_at', { ascending: false });

    if (readErr && cached) {
      // Offline with a clean cached copy — show it rather than an empty screen.
      setDay(cached.day);
      const cachedEvents = await roadsideDb.rods_events_cache.get(cached.day.id).catch(() => undefined);
      setSegments((cachedEvents?.events ?? []).map(toDraft));
      setLoading(false);
      return;
    }

    const list = (rows ?? []) as unknown as RodsDay[];
    target = list.find((d) => d.status === 'draft') ?? list[0] ?? null;

    if (!target && autoCreate) {
      // Carrier identity is snapshotted from the device cache, never read live
      // and never taken from a constant. If it was never cached we stop: an
      // uncertifiable log with a guessed carrier is worse than no log yet.
      let carrier;
      try {
        carrier = await requireCachedCarrier();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : CARRIER_CACHE_MISSING_MESSAGE);
        setLoading(false);
        return;
      }
      // The id is minted HERE, not by the database. A driver in a dead zone
      // starting the day's log is the whole point of the offline path, and a
      // server-generated id would make creation the one step that needs a
      // signal. The same UUID is used by every later write, so the row the
      // queue eventually inserts is the row the driver has been editing.
      const now = new Date().toISOString();
      target = {
        id: crypto.randomUUID(),
        operator_id: operatorId,
        log_date: logDate,
        record_source: 'keyed',
        status: 'draft',
        locked: false,
        is_reconstructed: !!isReconstruction,
        created_at: now,
        updated_at: now,
        ...rodsDayCarrierSnapshot(carrier),
        ...defaults,
      } as unknown as RodsDay;
      version.current += 1;
      await putCachedDay({
        day: target,
        operator_id: operatorId,
        log_date: logDate,
        unsynced: true,
        version: version.current,
        local_certified_at: null,
        sync_rejected: false,
        sync_stalled: false,
      });
      await putCachedEvents({
        rods_day_id: target.id, log_date: logDate, events: [], unsynced: true, version: version.current,
      });
      await enqueueCoalesced({
        kind: 'save_draft_day',
        coalesce_key: `save_draft_day:${logDate}`,
        payload: { operator_id: operatorId, log_date: logDate, day_id: target.id, version: version.current },
      });
    }

    setDay(target);
    if (target) {
      const { data: evs } = await supabase
        .from('rods_events')
        .select('*')
        .eq('rods_day_id', target.id)
        .order('start_minute');
      const rowsOut = (evs ?? []) as unknown as RodsEvent[];
      setSegments(rowsOut.map(toDraft));
      // Keep the cache aligned with what was just read, so the roadside packet
      // and an offline reload agree with the editor.
      if (!cacheIsAuthoritative) {
        await putCachedDay({
          day: target,
          operator_id: operatorId,
          log_date: logDate,
          unsynced: false,
          version: version.current,
          local_certified_at: null,
          sync_rejected: cached?.sync_rejected ?? false,
          sync_stalled: cached?.sync_stalled ?? false,
        }).catch(() => undefined);
        await putCachedEvents({
          rods_day_id: target.id, log_date: logDate, events: rowsOut,
          unsynced: false, version: version.current,
        }).catch(() => undefined);
      }
    } else {
      setSegments([]);
    }
    setLoading(false);
  }, [operatorId, logDate, autoCreate, isReconstruction, defaults]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [operatorId, logDate]);

  /**
   * Edits are accumulated, not replaced. The debounce timer is shared across
   * every header field, so scheduling the last patch alone silently dropped
   * every field touched inside the debounce window — and the amendment change
   * record, computed from on-screen state, then claimed changes that had never
   * reached the row.
   */
  const patchHeader = useCallback((patch: Partial<RodsDay>) => {
    setDay((prev) => (prev ? { ...prev, ...patch } : prev));
    pendingHeader.current = { ...pendingHeader.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushPendingHeader(); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id]);

  /**
   * A filtered write means the server row is certified and what is on screen
   * is a phantom. Tell the driver, invalidate the offline cache, and re-pull.
   */
  const handleWriteFailure = useCallback(async (err: unknown) => {
    if (isRowNotWritable(err)) {
      await markDayStale(logDate);
      toast.error(err.message);
      await load();
      return;
    }
    toast.error(err instanceof Error ? err.message : 'Could not save this log.');
  }, [logDate, load]);

  const flushHeader = useCallback(async (patch: Partial<RodsDay>): Promise<HeaderFlushResult> => {
    if (!day || day.locked) return 'nothing-pending';
    if (localCertifiedAt.current) return 'locked';
    setSaving(true);
    try {
      // LOCAL FIRST, and the queue owns the network. Writing the row here as
      // well would give a day two writers racing on the same columns, and the
      // loser silently reverts the driver's edit. The cache is the draft; the
      // queue replays it from the cache when there is a signal.
      const merged = { ...day, ...patch } as RodsDay;
      version.current += 1;
      await putCachedDay({
        day: merged,
        operator_id: merged.operator_id,
        log_date: merged.log_date,
        unsynced: true,
        version: version.current,
        local_certified_at: null,
        sync_rejected: false,
        sync_stalled: false,
      });
      await enqueueCoalesced({
        kind: 'save_draft_day',
        coalesce_key: `save_draft_day:${merged.log_date}`,
        payload: {
          operator_id: merged.operator_id,
          log_date: merged.log_date,
          day_id: merged.id,
          version: version.current,
        },
      });
      // Cleared only now, and only for the keys this write actually carried.
      // A field edited while the write was in flight stays pending.
      for (const [k, v] of Object.entries(patch)) {
        const current = (pendingHeader.current as Record<string, unknown>)[k];
        if (Object.is(current, v)) delete (pendingHeader.current as Record<string, unknown>)[k];
      }
      return 'saved';
    } catch (err) {
      await handleWriteFailure(err);
      throw new HeaderFlushHandledError();
    } finally {
      setSaving(false);
    }
  }, [day, handleWriteFailure]);

  /**
   * Writes whatever header edits are still sitting in the debounce window.
   * Certification must call this first: the change record is derived from what
   * is on screen, so an unflushed edit would be recorded as changed while the
   * row it describes kept its old value — and the row locks a moment later.
   */
  const flushPendingHeader = useCallback(async (): Promise<HeaderFlushResult> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const patch = { ...pendingHeader.current };
    if (!Object.keys(patch).length) return 'nothing-pending';
    return flushHeader(patch);
  }, [flushHeader]);

  /**
   * Every way out of the editor flushes: unmount, tab hidden, app backgrounded
   * or closed. On iOS a PWA is frozen on `pagehide` without another frame, so
   * a 700 ms debounce that has not fired yet is simply lost — the driver's last
   * keystrokes vanish with no error anywhere.
   */
  useEffect(() => {
    const flush = () => { void flushPendingHeader().catch(() => {}); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flushPendingHeader]);

  /** Replaces the day's segments wholesale — simplest correct write for a small set. */
  const saveSegments = useCallback(async (next: DraftSegment[]) => {
    if (!day) return false;
    if (localCertifiedAt.current) { toast.error(LOCAL_CERTIFIED_MESSAGE); return false; }
    setSaving(true);
    try {
      // Same sovereignty rule as the header: segments land in the cache, and
      // the queue does the delete-and-reinsert against the server from that
      // cached set. Segment edits shared the header's debounce race shape, so
      // they get the same single-writer treatment rather than a second fix.
      version.current += 1;
      await putCachedEvents({
        rods_day_id: day.id,
        log_date: day.log_date,
        events: next.map((s) => toEventRow(day.id, s)),
        unsynced: true,
        version: version.current,
      });
      await enqueueCoalesced({
        kind: 'save_draft_segments',
        coalesce_key: `save_draft_segments:${day.log_date}`,
        payload: {
          operator_id: day.operator_id,
          log_date: day.log_date,
          day_id: day.id,
          version: version.current,
        },
      });
      return true;
    } catch (err) {
      await handleWriteFailure(err);
      return false;
    } finally {
      setSaving(false);
    }
  }, [day, handleWriteFailure]);

  return {
    day, setDay, segments, setSegments,
    loading, saving,
    localCertifiedAt: localCertifiedAt.current,
    reload: load,
    patchHeader, flushPendingHeader, saveSegments,
  };
}