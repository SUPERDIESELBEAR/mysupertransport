/**
 * Reading `dispatch_daily_log` while the absence-reason columns are staged.
 *
 * `absence_reason`, `notes_by` and `notes_at` are added by an additive draft
 * migration and only exist once that draft is accepted. Selecting them before
 * that makes PostgREST answer 42703 and return NO ROWS AT ALL, which blanked
 * every driver calendar (all days painted "unknown"). So: ask for the full
 * shape, and on a missing-column error retry with the long-standing fields
 * only, treating the reason as empty. Once the columns land the first attempt
 * succeeds and the fallback never fires again.
 */
import { supabase } from '@/integrations/supabase/client';

export type DispatchDayStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

export interface DispatchDayLogRow {
  id: string;
  log_date: string;
  status: DispatchDayStatus;
  notes: string | null;
  absence_reason: string | null;
  notes_by: string | null;
  notes_at: string | null;
}

const BASE_SELECT = 'id, log_date, status, notes';
const FULL_SELECT = 'id, log_date, status, notes, absence_reason, notes_by, notes_at';

/** Fields that only exist after the staged migration is accepted. */
export const ABSENCE_FIELDS = ['absence_reason', 'notes_by', 'notes_at'] as const;

/** True for the PostgREST/Postgres "column does not exist" failure. */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  if (e.code === '42703') return true;
  return /column .* does not exist/i.test(e.message ?? '');
}

/**
 * Remembered across calls so we stop paying for a doomed round trip on every
 * month change. `null` = not yet known.
 */
let reasonColumnAvailable: boolean | null = null;

/** Test seam only. */
export function __resetReasonColumnCache(value: boolean | null = null) {
  reasonColumnAvailable = value;
}

export function reasonColumnKnownMissing(): boolean {
  return reasonColumnAvailable === false;
}

export interface FetchDayLogsResult {
  logs: DispatchDayLogRow[];
  /** False while the staged columns are absent — callers hide the reason editor. */
  hasReasonColumn: boolean;
  error: string | null;
}

export async function fetchDispatchDayLogs(
  operatorId: string,
  from: string,
  to: string,
  opts: { order?: 'asc' | 'desc' } = {},
): Promise<FetchDayLogsResult> {
  // Both select lists are written out literally so the repo's select scanner
  // can read them statically.
  const run = async (full: boolean) => {
    const base = full
      ? supabase.from('dispatch_daily_log').select(FULL_SELECT)
      : supabase.from('dispatch_daily_log').select(BASE_SELECT);
    let q = (base as unknown as {
      eq: (c: string, v: string) => typeof q;
      gte: (c: string, v: string) => typeof q;
      lte: (c: string, v: string) => typeof q;
      order: (c: string, o: { ascending: boolean }) => typeof q;
      then: unknown;
    })
      .eq('operator_id', operatorId)
      .gte('log_date', from)
      .lte('log_date', to);
    if (opts.order) q = q.order('log_date', { ascending: opts.order === 'asc' });
    return await (q as unknown as Promise<{ data: unknown; error: { code?: string; message: string } | null }>);
  };

  const normalize = (data: unknown, hasReasonColumn: boolean): DispatchDayLogRow[] =>
    ((data as Array<Record<string, unknown>> | null) ?? []).map(r => ({
      id: String(r.id ?? ''),
      log_date: String(r.log_date),
      status: r.status as DispatchDayStatus,
      notes: (r.notes as string | null) ?? null,
      absence_reason: hasReasonColumn ? ((r.absence_reason as string | null) ?? null) : null,
      notes_by: hasReasonColumn ? ((r.notes_by as string | null) ?? null) : null,
      notes_at: hasReasonColumn ? ((r.notes_at as string | null) ?? null) : null,
    }));

  if (reasonColumnAvailable !== false) {
    const { data, error } = await run(true);
    if (!error) {
      reasonColumnAvailable = true;
      return { logs: normalize(data, true), hasReasonColumn: true, error: null };
    }
    if (!isMissingColumnError(error)) {
      return { logs: [], hasReasonColumn: reasonColumnAvailable === true, error: error.message };
    }
    reasonColumnAvailable = false;
  }

  const { data, error } = await run(false);
  if (error) return { logs: [], hasReasonColumn: false, error: error.message };
  return { logs: normalize(data, false), hasReasonColumn: false, error: null };
}

/**
 * Drop the staged fields from a write payload when the columns are not there
 * yet, so marking a day still works today.
 */
export function stripAbsenceFields<T extends Record<string, unknown>>(
  payload: T,
  hasReasonColumn: boolean,
): Record<string, unknown> {
  if (hasReasonColumn) return { ...payload };
  const out: Record<string, unknown> = { ...payload };
  for (const f of ABSENCE_FIELDS) delete out[f];
  return out;
}
