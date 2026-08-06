import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { UnsavedStatus } from '@/hooks/useUnsavedChanges';

interface Options {
  /** Column on `onboarding_status` to persist. */
  field: string;
  /** Current local value (what the staff member sees in the textarea). */
  value: string | null;
  /** Row id of the onboarding_status record (preferred selector). */
  statusId: string | null;
  /** Fallback selector when statusId is not loaded yet. */
  operatorId: string;
  /** True once the record has loaded — prevents saving the empty initial state. */
  ready: boolean;
  /** False in demo mode / read-only contexts: never writes. */
  canSave: boolean;
  /** Debounce in ms. */
  delay?: number;
}

const norm = (v: string | null | undefined) => (v ?? '').trim() === '' ? null : (v as string);

/**
 * Debounced, per-field auto-save for a single `onboarding_status` note column.
 * Mirrors the Internal Notes behaviour: saves ~1.5s after typing stops, can be
 * flushed immediately (blur / unmount / tab close), and exposes a status pill state.
 */
export function useAutoSaveStatusField({
  field, value, statusId, operatorId, ready, canSave, delay = 1500,
}: Options) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const lastSaved = useRef<string | null | undefined>(undefined);

  // Latest values for use inside unmount / beforeunload handlers.
  const latest = useRef({ value, statusId, operatorId, ready, canSave });
  latest.current = { value, statusId, operatorId, ready, canSave };

  // Baseline the first time the record is available.
  useEffect(() => {
    if (ready && lastSaved.current === undefined) lastSaved.current = norm(value);
  }, [ready, value]);

  const dirty =
    ready && lastSaved.current !== undefined && norm(value) !== lastSaved.current;

  const save = useCallback(async () => {
    const cur = latest.current;
    if (!cur.ready || !cur.canSave) return;
    if (lastSaved.current === undefined) return;
    const next = norm(cur.value);
    if (next === lastSaved.current) return;

    setSaving(true);
    setFailed(false);
    try {
      const q = supabase.from('onboarding_status').update({ [field]: next } as never);
      const { error } = await (cur.statusId
        ? q.eq('id', cur.statusId)
        : q.eq('operator_id', cur.operatorId));
      if (error) throw error;
      lastSaved.current = next;
      setSavedAt(new Date());
    } catch (e: unknown) {
      setFailed(true);
      toast({
        title: 'Failed to save notes',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [field]);

  const saveRef = useRef(save);
  saveRef.current = save;

  /** Persist immediately (blur, collapse, unmount, tab close). */
  const flush = useCallback(() => { void saveRef.current(); }, []);

  // Debounced auto-save.
  useEffect(() => {
    if (!dirty || !canSave) return;
    const t = window.setTimeout(() => { void saveRef.current(); }, delay);
    return () => window.clearTimeout(t);
  }, [dirty, canSave, delay, value]);

  // Flush on unmount and on tab close / hide.
  useEffect(() => {
    const onHide = () => { void saveRef.current(); };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void saveRef.current();
    };
  }, []);

  const status: UnsavedStatus = !canSave
    ? 'idle'
    : failed
      ? 'error'
      : saving
        ? 'saving'
        : dirty
          ? 'dirty'
          : savedAt
            ? 'saved'
            : 'idle';

  return { status, savedAt, flush, retry: flush, dirty };
}
