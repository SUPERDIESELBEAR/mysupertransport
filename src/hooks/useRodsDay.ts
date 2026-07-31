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

  const load = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from('rods_days')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('log_date', logDate)
      .neq('status', 'superseded')
      .order('created_at', { ascending: false });

    const list = (rows ?? []) as unknown as RodsDay[];
    let target = list.find((d) => d.status === 'draft') ?? list[0] ?? null;

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
      const { data: created, error } = await supabase
        .from('rods_days')
        .insert({
          operator_id: operatorId,
          log_date: logDate,
          record_source: 'keyed',
          status: 'draft',
          is_reconstructed: !!isReconstruction,
          ...rodsDayCarrierSnapshot(carrier),
          ...defaults,
        })
        .select('*')
        .single();
      if (error) { toast.error(error.message); setLoading(false); return; }
      target = created as unknown as RodsDay;
    }

    setDay(target);
    if (target) {
      const { data: evs } = await supabase
        .from('rods_events')
        .select('*')
        .eq('rods_day_id', target.id)
        .order('start_minute');
      setSegments(((evs ?? []) as unknown as RodsEvent[]).map(toDraft));
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

  const flushHeader = useCallback(async (patch: Partial<RodsDay>) => {
    if (!day || day.locked) return false;
    setSaving(true);
    try {
      // .select('id') is not cosmetic: without the returned representation a
      // write filtered by RLS is indistinguishable from one that committed.
      const res = await supabase.from('rods_days')
        .update(patch as never).eq('id', day.id).select('id');
      assertRowsAffected(res, {
        table: 'rods_days', operation: 'header update', dayId: day.id, logDate: day.log_date,
      });
      return true;
    } catch (err) {
      await handleWriteFailure(err);
      return false;
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
  const flushPendingHeader = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const patch = pendingHeader.current;
    pendingHeader.current = {};
    if (!Object.keys(patch).length) return true;
    return flushHeader(patch);
  }, [flushHeader]);

  /** Replaces the day's segments wholesale — simplest correct write for a small set. */
  const saveSegments = useCallback(async (next: DraftSegment[]) => {
    if (!day) return false;
    setSaving(true);
    try {
      const { error: delErr } = await supabase.from('rods_events')
        .delete().eq('rods_day_id', day.id).select('id');
      if (delErr) throw new Error(delErr.message);
      // A delete removing nothing is ambiguous — the day may have had no
      // segments. Anything still standing means RLS filtered the delete.
      const { count, error: countErr } = await supabase.from('rods_events')
        .select('id', { count: 'exact', head: true }).eq('rods_day_id', day.id);
      if (countErr) throw new Error(countErr.message);
      assertDeleteApplied(count ?? 0, { dayId: day.id, logDate: day.log_date });

      if (next.length) {
        const payload = next.map((s) => ({
          rods_day_id: day.id,
          start_minute: s.start_minute,
          end_minute: s.end_minute,
          duty_status: s.duty_status,
          city: s.city.trim() || null,
          state: s.state.trim().toUpperCase() || null,
          remarks: s.remarks.trim() || null,
          is_short_period: isShortPeriod(s.start_minute, s.end_minute),
        }));
        const res = await supabase.from('rods_events').insert(payload as never).select('id');
        assertRowsAffected(res, {
          table: 'rods_events', operation: 'segment insert', dayId: day.id, logDate: day.log_date,
        });
      }
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
    reload: load,
    patchHeader, flushPendingHeader, saveSegments,
  };
}