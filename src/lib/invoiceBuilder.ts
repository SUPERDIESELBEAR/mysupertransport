/**
 * THE PURE INVOICE BUILDER — Module 7, Pass 2.
 *
 * PURE. No supabase client, no React, no queries, no globals. It takes a load
 * and its charges and returns the broker-facing invoice with its itemised
 * lines. Nothing here persists anything: the writer, the RPC and the screen
 * are Pass 3.
 *
 * WHAT AN INVOICE IS (Module 7 Pass 1 record):
 *
 *   header rate + unbundled FSC + ALL load charges, at full amount
 *
 * THERE IS NO EXCLUSION PREDICATE HERE, and its absence is the rule, not an
 * omission. §4.3 asks "is there carrier margin in this line for a 5% dispatch
 * fee to come out of". That question does not exist on the broker side: the
 * broker owes the detention at 100%, owes the lumper, and owes a
 * reimbursement-classed charge in full. The invoice figure and the dispatch
 * base are SUPPOSED to differ, and anyone who "fixes" the difference has
 * broken one of them.
 *
 * The parts themselves are NOT assembled here — they come from
 * `assembleLoadRateParts`, shared with `computeDispatchSettlement`, so the two
 * can never disagree about what a load is made of.
 */
import type { LoadChargeRecord } from '@/lib/loadCharges';
import {
  assembleLoadRateParts,
  type HeaderBasis,
  type LoadRateBasis,
} from '@/lib/loadRateParts';

export interface InvoiceLoadInput extends LoadRateBasis {
  id: string;
  loadNumber: string;
  charges?: LoadChargeRecord[] | null;
}

export type InvoiceLineType = 'linehaul' | 'fsc' | 'charge';

export interface InvoiceLine {
  lineType: InvoiceLineType;
  description: string;
  amount: number;
  /** Set on a `charge` line only; the `load_charges` row it bills. */
  loadChargeId: string | null;
  chargeType: string | null;
}

export interface BuiltInvoice {
  loadId: string;
  loadNumber: string;
  headerBasis: HeaderBasis;
  headerComponent: number;
  fscComponent: number;
  chargesTotal: number;
  /** The broker-facing figure. Equals the sum of `lines` to the cent. */
  amount: number;
  lines: InvoiceLine[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const HEADER_DESCRIPTION: Record<HeaderBasis, string> = {
  flat: 'Linehaul',
  per_mile: 'Linehaul — per mile',
  per_ton: 'Linehaul — per ton (scale ticket)',
  loadout: 'Trailer relocation fee',
};

/** The invoice for ONE load. One invoice per load is the Pass 1 shape. */
export function buildLoadInvoice(load: InvoiceLoadInput): BuiltInvoice {
  const parts = assembleLoadRateParts(load, load.charges);
  const lines: InvoiceLine[] = [];

  // A zero header still prints: a $0 loadout is a real thing, and a line
  // omitted is a line nobody notices is missing.
  lines.push({
    lineType: 'linehaul',
    description: HEADER_DESCRIPTION[parts.headerBasis],
    amount: parts.headerComponent,
    loadChargeId: null,
    chargeType: null,
  });

  if (parts.fscComponent !== 0) {
    lines.push({
      lineType: 'fsc',
      description: 'Fuel surcharge',
      amount: parts.fscComponent,
      loadChargeId: null,
      chargeType: null,
    });
  }

  for (const part of parts.chargeParts) {
    lines.push({
      lineType: 'charge',
      description: chargeDescription(part.chargeType),
      amount: part.amount,
      loadChargeId: part.chargeId,
      chargeType: part.chargeType,
    });
  }

  return {
    loadId: load.id,
    loadNumber: load.loadNumber,
    headerBasis: parts.headerBasis,
    headerComponent: parts.headerComponent,
    fscComponent: parts.fscComponent,
    chargesTotal: parts.chargesTotal,
    amount: round2(lines.reduce((s, l) => s + l.amount, 0)),
    lines,
  };
}

const CHARGE_LABELS: Record<string, string> = {
  linehaul: 'Linehaul adjustment',
  fsc: 'Fuel surcharge',
  detention: 'Detention',
  stopoff: 'Stop-off',
  lumper: 'Lumper',
  layover: 'Layover',
  tonu: 'Truck ordered not used',
  reimbursement: 'Reimbursement',
  other: 'Accessorial',
};

function chargeDescription(chargeType: string): string {
  return CHARGE_LABELS[chargeType] ?? 'Accessorial';
}
