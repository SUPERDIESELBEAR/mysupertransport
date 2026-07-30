import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  CARRIER_CACHE_MISSING_MESSAGE, requireCachedCarrier, rodsDayCarrierSnapshot,
} from '@/lib/eld/carrierIdentity';
import { isShortPeriod } from '@/lib/eld/rodsValidation';
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

  const patchHeader = useCallback((patch: Partial<RodsDay>) => {
    setDay((prev) => (prev ? { ...prev, ...patch } : prev));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushHeader(patch); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id]);

  const flushHeader = useCallback(async (patch: Partial<RodsDay>) => {
    if (!day || day.locked) return;
    setSaving(true);
    const { error } = await supabase.from('rods_days').update(patch as never).eq('id', day.id);
    setSaving(false);
    if (error) toast.error(error.message);
  }, [day]);

  /** Replaces the day's segments wholesale — simplest correct write for a small set. */
  const saveSegments = useCallback(async (next: DraftSegment[]) => {
    if (!day) return false;
    setSaving(true);
    const { error: delErr } = await supabase.from('rods_events').delete().eq('rods_day_id', day.id);
    if (delErr) { setSaving(false); toast.error(delErr.message); return false; }
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
      const { error } = await supabase.from('rods_events').insert(payload as never);
      if (error) { setSaving(false); toast.error(error.message); return false; }
    }
    setSaving(false);
    return true;
  }, [day]);

  return {
    day, setDay, segments, setSegments,
    loading, saving,
    reload: load,
    patchHeader, saveSegments,
  };
}