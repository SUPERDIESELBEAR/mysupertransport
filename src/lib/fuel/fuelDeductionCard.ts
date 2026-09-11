/**
 * THE MANAGEMENT DEDUCTION CARD — what the driver IS or WILL BE deducted.
 *
 * DISPLAY ONLY. No money is computed here that is not already on
 * `FuelDriverTotals`; this module chooses the HEADLINE and the explanatory
 * lines, nothing else.
 *
 * THE CORRECTION THIS HOLDS (2026-09-11). "Deducted from settlements" and
 * "Not yet deducted" printed `total` — the NET, what MultiService billed the
 * company after the discount. That is not what leaves the driver's pay. The
 * settlement engine deducts the GROSS in every state, so a total labelled
 * "deducted" must be the gross or the heading contradicts the figure.
 *
 * The 2026-09-11 scoping decision — management-facing stays net — is CORRECTED
 * here, not reversed: the per-transaction TABLE keeps the net per row with its
 * Discount column, because that is the company's billing record. Only the
 * totals labelled as a deduction move to the gross.
 *
 * The two states are made legible rather than collapsed:
 *  - pass-through OFF: the gross is deducted and the company KEEPS the
 *    discount; the discount is shown as retained, with the billed net beneath.
 *  - pass-through ON: the gross is still deducted, and the discount is credited
 *    back on the settlement, so the deduction nets out to the billed amount.
 */
import type { FuelDriverTotals } from './fuelDriverDetail';

export interface DeductionLine {
  label: string;
  /** Signed as it should read: the discount is negative in both states. */
  amount: number;
  /** True for the credit that returns the discount to an ON driver. */
  credit?: boolean;
}

export interface DeductionCard {
  /** THE DEDUCTION. The gross, in both states. */
  headline: number;
  /** Present only when gross and net differ for this driver. */
  discountLine: DeductionLine | null;
  /** The bottom line beneath the discount, when there is one. */
  netLine: DeductionLine | null;
  /** Plain-language state, printable next to the figures. */
  stateNote: string | null;
}

export const PASSTHROUGH_ON_LABEL = 'Fuel discount: passed through to this driver';
export const PASSTHROUGH_OFF_LABEL = 'Fuel discount: not passed through';

export function passthroughLabel(passthrough: boolean): string {
  return passthrough ? PASSTHROUGH_ON_LABEL : PASSTHROUGH_OFF_LABEL;
}

/** The one sentence that stops the next reader reporting a discrepancy. */
export const COMPANY_VIEW_NOTE =
  'Company view: each purchase is listed at the amount MultiService billed us, '
  + 'with the discount shown. The driver’s own statement shows the gross amount '
  + 'he is deducted.';

export function buildDeductionCard(
  totals: FuelDriverTotals,
  passthrough: boolean,
): DeductionCard {
  const discount = Math.round(totals.discount * 100) / 100; // ≤ 0
  const headline = totals.grossTotal;

  if (discount === 0) {
    return { headline, discountLine: null, netLine: null, stateNote: null };
  }

  if (passthrough) {
    return {
      headline,
      discountLine: { label: 'Discount credited to driver', amount: discount, credit: true },
      netLine: { label: 'Net deduction', amount: Math.round((headline + discount) * 100) / 100 },
      stateNote: 'The discount is credited back on his settlement, so the deduction nets out.',
    };
  }

  return {
    headline,
    discountLine: { label: 'Discount retained by company', amount: discount },
    netLine: { label: 'Billed to the company', amount: Math.round((headline + discount) * 100) / 100 },
    stateNote: 'The driver is deducted the gross; the company keeps the discount.',
  };
}
