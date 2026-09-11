/**
 * THE DRIVER'S OWN FUEL — the read, and only the read.
 *
 * ISOLATION IS NOT DONE HERE. `my_fuel_transactions()` takes no argument: the
 * operator is resolved inside the function from `auth.uid()`, so there is no
 * parameter this file could get wrong and no id a client could substitute.
 * A query filtered by an operator id the client supplies is a filter, not
 * isolation, and this module deliberately cannot express one.
 *
 * NO SECOND VERSION OF THE MONEY. Every figure the driver sees is built by
 * `buildDriverRows` in `./fuelDriverDetail`, the same function the management
 * screen calls, off the same `fuelBucketLines` assembler. This file only
 * reshapes rows the database returned.
 *
 * WHAT IS DELIBERATELY ABSENT: match status, unmatched reasons, disagreement
 * fields, reconciliation verdicts. Those are staff tools about the quality of
 * OUR records. Their absence cannot move a number — `fuelBucketLines` uses
 * `reconciliationOk` only to append a note to a line DESCRIPTION, never to
 * compute an amount — so the driver's totals and the owner's totals are the
 * same arithmetic on the same inputs.
 */
import { supabase } from '@/integrations/supabase/client';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import type { FuelDriverTransaction, SettledFuelIndex } from './fuelDriverDetail';

interface MyFuelRpcRow {
  id: string;
  invoice_no: string | null;
  invoice_date: string;
  merchant_name: string | null;
  city: string | null;
  state: string | null;
  total_amount: number | string | null;
  fuel_discount_amount: number | string | null;
  diesel_amount: number | string | null;
  diesel_gallons: number | string | null;
  lines: { line_type: string; amount: number | string | null }[] | null;
  settlement_id: string | null;
  period_start: string | null;
  period_end: string | null;
  payday: string | null;
  settlement_status: string | null;
  work_week_start_dow: number | null;
  discount_passthrough?: boolean | null;
}

export interface MyFuelData {
  transactions: FuelDriverTransaction[];
  settled: SettledFuelIndex;
  /**
   * The CONFIGURED work week, carried on every row by the function. Operators
   * cannot read `settlement_settings`, and quietly defaulting it here is the
   * one way the driver's weeks and the office's weeks could drift apart.
   */
  workWeekStartDow: number;
  /**
   * Whether the fuel discount is passed through to THIS driver, resolved in the
   * database (his own setting first, the company default second). Drivers cannot
   * read pay policies, so the answer arrives with the rows. When false, this
   * screen shows no discount at all — the deduction is unaffected either way.
   */
  discountPassthrough: boolean;
}

/** Reshape one RPC row into the shape the shared row builder already takes. */
export function toDriverTransaction(row: MyFuelRpcRow): FuelDriverTransaction {
  return {
    id: row.id,
    invoice_no: row.invoice_no ?? '',
    invoice_date: row.invoice_date,
    merchant_name: row.merchant_name,
    city: row.city,
    state: row.state,
    total_amount: row.total_amount,
    fuel_discount_amount: row.fuel_discount_amount,
    diesel_amount: row.diesel_amount,
    diesel_gallons: row.diesel_gallons,
    // The importer's verdict is a staff fact and is not sent to the driver.
    // It changes no amount; see the header.
    reconciliation_ok: true,
    reconciliation_delta: 0,
    fuel_transaction_lines: row.lines ?? [],
  };
}

/** Deducted or not is read from the settlement the function joined, never a date. */
export function toSettledIndex(rows: MyFuelRpcRow[]): SettledFuelIndex {
  const index: SettledFuelIndex = {};
  for (const r of rows) {
    if (!r.settlement_id || !r.period_start || !r.period_end) continue;
    index[r.id] = {
      settlementId: r.settlement_id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payday: r.payday ?? null,
      status: r.settlement_status ?? null,
    };
  }
  return index;
}

export function shapeMyFuel(rows: MyFuelRpcRow[]): MyFuelData {
  return {
    transactions: rows.map(toDriverTransaction),
    settled: toSettledIndex(rows),
    workWeekStartDow: rows[0]?.work_week_start_dow ?? SETTLEMENT_SETTINGS_DEFAULTS.work_week_start_dow,
  };
}

export async function fetchMyFuel(): Promise<MyFuelData> {
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string) => Promise<{ data: MyFuelRpcRow[] | null; error: { message: string } | null }>;
  }).rpc('my_fuel_transactions');
  if (error) throw new Error(error.message);
  return shapeMyFuel(data ?? []);
}
