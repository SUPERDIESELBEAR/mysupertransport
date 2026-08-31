/**
 * PER-TON BULK IS PAID ON THE SCALE TICKET.
 *
 * `confirmed_tons` is the authoritative figure for a per-ton load: it is what
 * actually crossed the scale, and producing that number is the entire purpose
 * of the ticket. `estimated_tons` is what everyone thought before loading.
 *
 * The two readers therefore split deliberately:
 *
 *   - the BROKER-FACING total (`recompute_load_total_value`) falls back to
 *     estimated tons while a load is in flight, so a live load never shows $0;
 *   - the DRIVER-FACING settlement never falls back. Without a ticket the
 *     engine produces no linehaul line at all and names the load as pending.
 *
 * Paying on estimated tons was considered and rejected: the correction, once
 * the ticket arrives, is an adjustment, and no adjustment path exists — the
 * -A1 late-accessorial scheme is documented and unimplemented, and the
 * engine's `adjustment` line type has no producer. A short check that cannot
 * be corrected is worse than a check that waits for the ticket.
 *
 * Because a per-ton load already REQUIRES a scale ticket as paperwork, an
 * unscaled load is normally withheld before it is ever valued. This state is
 * the narrower one: released for paperwork, or otherwise reaching the engine,
 * still with no tons confirmed.
 */

export const AWAITING_SCALE_TICKET_LABEL = 'Awaiting scale ticket';

export const AWAITING_SCALE_TICKET_EXPLANATION =
  'This per-ton load has delivered with no confirmed tons, so there is nothing '
  + 'authoritative to pay on. Record the tons from the scale ticket; until then '
  + 'the load total is based on estimated tons and the driver is not paid for it.';

interface PerTonLoadLike {
  rate_type?: string | null;
  load_type?: string | null;
  confirmed_tons?: number | string | null;
  delivered_at?: string | null;
}

/** A per-ton load, by either the rate type or the load type. */
export function isPerTon(load: PerTonLoadLike): boolean {
  return load.rate_type === 'per_ton' || load.load_type === 'per_ton';
}

/**
 * True when a per-ton load has delivered but nobody has recorded what crossed
 * the scale. SURFACED on Load Detail and in the loads list, exactly as a
 * missing delivery instant is, so it is found before payday rather than in a
 * driver's short check.
 */
export function isAwaitingScaleTicket(load: PerTonLoadLike): boolean {
  if (!isPerTon(load)) return false;
  if (load.confirmed_tons !== null && load.confirmed_tons !== undefined && load.confirmed_tons !== '') {
    return false;
  }
  return Boolean(load.delivered_at);
}
