/**
 * MODULE 4 PASS 3 — the driver's reading of a settlement.
 *
 * PRESENTATION ONLY. It shapes rows the engine (or the persisted result of the
 * engine) already produced. It NEVER re-derives an amount, and it never writes
 * a second copy of a driver-facing string: withheld wording arrives from
 * `settlement_withheld_loads.message`, which is `WithholdReason.message` from
 * src/lib/settlementEngine.ts, and status wording comes from
 * src/lib/settlementConfig.ts.
 *
 * The driver never sees gross linehaul or a pay percentage. Nothing in this
 * module reads either; the only figures here are his own.
 */
import type { SettlementStatus } from '@/lib/settlementConfig';

export interface DriverSettlementLine {
  id: string;
  lineType: string;
  amount: number;
  description: string;
}

export interface DriverWithheldLoad {
  id: string;
  loadNumber: string;
  /** The engine's own sentence. Rendered verbatim. */
  message: string;
  outstanding: string[];
}

export interface DriverSettlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  payday: string | null;
  status: SettlementStatus;
  netAmount: number;
  holdReason: string | null;
  lines: DriverSettlementLine[];
  withheld: DriverWithheldLoad[];
}

export interface DriverRmDeposit {
  currentBalance: number;
  targetAmount: number | null;
}

/** Earning lines, in the order they were computed. */
export function earningLines(s: DriverSettlement): DriverSettlementLine[] {
  return s.lines.filter(l => l.amount > 0);
}

/** Deduction lines, magnitudes kept positive for display. */
export function deductionLines(s: DriverSettlement): DriverSettlementLine[] {
  return s.lines.filter(l => l.amount < 0);
}

export function sumLines(lines: DriverSettlementLine[]): number {
  return Math.round(lines.reduce((t, l) => t + Math.abs(l.amount), 0) * 100) / 100;
}
