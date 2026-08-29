import { supabase } from '@/integrations/supabase/client';
import type { ParsedFuelRow } from './multiserviceCsv';

/**
 * The client half of the fuel import. Every write goes through an RPC — the
 * review queue in particular has ONE writer (`assign_fuel_transaction_operator`)
 * so the unmatched → matched transition cannot be made two different ways.
 */

export type FuelMatchStatus = 'matched' | 'unmatched' | 'matched_with_disagreement';

export interface FuelDisagreement {
  field: 'unit_no' | 'driver_name';
  csv_value: string | null;
  system_value: string | null;
}

export interface FuelPreviewRow {
  invoice_no: string;
  invoice_date: string;
  card_no: string;
  unit_no: string | null;
  driver_name: string | null;
  total_amount: number;
  duplicate: boolean;
  operator_id: string | null;
  match_status: FuelMatchStatus;
  disagreement_fields: FuelDisagreement[];
  reconciliation_ok: boolean;
  reconciliation_delta: number;
}

export interface FuelPreview {
  row_count: number;
  importable_count: number;
  duplicate_count: number;
  matched_count: number;
  unmatched_count: number;
  disagreement_count: number;
  flagged_count: number;
  total_amount: number;
  date_range_start: string | null;
  date_range_end: string | null;
  rows: FuelPreviewRow[];
}

export interface FuelCommitResult extends Omit<FuelPreview, 'rows' | 'importable_count'> {
  batch_id: string;
  imported_count: number;
}

/** Rows as the RPCs expect them: flat money fields plus derived line items. */
function toPayload(rows: ParsedFuelRow[]) {
  return rows.map((r) => ({ ...r }));
}

export async function previewFuelImport(rows: ParsedFuelRow[]): Promise<FuelPreview> {
  const { data, error } = await supabase.rpc('preview_fuel_import', {
    _rows: toPayload(rows) as never,
  });
  if (error) throw error;
  return data as unknown as FuelPreview;
}

export async function commitFuelImport(
  fileName: string,
  rows: ParsedFuelRow[],
  provider = 'multiservice',
): Promise<FuelCommitResult> {
  const { data, error } = await supabase.rpc('commit_fuel_import', {
    _file_name: fileName,
    _provider: provider,
    _rows: toPayload(rows) as never,
  });
  if (error) throw error;
  return data as unknown as FuelCommitResult;
}

export async function assignFuelTransactionOperator(
  transactionId: string,
  operatorId: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('assign_fuel_transaction_operator', {
    _transaction_id: transactionId,
    _operator_id: operatorId,
    _note: note ?? null,
  });
  if (error) throw error;
}

export interface FuelTransactionRecord {
  id: string;
  batch_id: string;
  operator_id: string | null;
  card_no: string;
  unit_no: string | null;
  driver_name: string | null;
  city: string | null;
  state: string | null;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  match_status: FuelMatchStatus;
  disagreement_fields: FuelDisagreement[];
  reconciliation_ok: boolean;
  reconciliation_delta: number;
}

const TX_COLUMNS =
  'id, batch_id, operator_id, card_no, unit_no, driver_name, city, state, invoice_no, '
  + 'invoice_date, total_amount, match_status, disagreement_fields, reconciliation_ok, '
  + 'reconciliation_delta';

/** The review queue: everything that is not cleanly matched to a card holder. */
export async function fetchFuelReviewQueue(): Promise<FuelTransactionRecord[]> {
  const { data, error } = await supabase
    .from('fuel_transactions')
    .select(TX_COLUMNS)
    .neq('match_status', 'matched')
    .order('invoice_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as FuelTransactionRecord[];
}

/** Rows whose categories did not add up to the printed total. */
export async function fetchFuelFlaggedRows(): Promise<FuelTransactionRecord[]> {
  const { data, error } = await supabase
    .from('fuel_transactions')
    .select(TX_COLUMNS)
    .eq('reconciliation_ok', false)
    .order('invoice_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as FuelTransactionRecord[];
}

export interface FuelBatchRecord {
  id: string;
  file_name: string;
  imported_at: string;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  matched_count: number;
  unmatched_count: number;
  disagreement_count: number;
  flagged_count: number;
  total_amount: number;
  date_range_start: string | null;
  date_range_end: string | null;
}

export async function fetchFuelBatches(): Promise<FuelBatchRecord[]> {
  const { data, error } = await supabase
    .from('fuel_import_batches')
    .select(
      'id, file_name, imported_at, row_count, imported_count, duplicate_count, matched_count, '
      + 'unmatched_count, disagreement_count, flagged_count, total_amount, date_range_start, date_range_end',
    )
    .order('imported_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as FuelBatchRecord[];
}
