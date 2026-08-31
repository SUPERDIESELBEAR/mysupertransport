/**
 * EQUIPMENT RECEIPT — two facts, never conflated.
 *
 *   SHIPPED  — the driver sent it. Driver-writable. Recorded by
 *              `equipment_receipts` and the `mark_equipment_return_completed`
 *              trigger. Untouched by this module.
 *   RECEIVED — management physically has it. Management or owner only, written
 *              exclusively by `confirm_equipment_returned`.
 *
 * A tracking number is not a returned ELD. The settlement hold protects against
 * equipment we do not have, so it cannot be gated by a stamp the driver writes
 * himself.
 *
 * `equipmentOutstanding` is the derived value the Pass 2 hold formula reads:
 * TRUE until management confirms receipt, FALSE after. Partial returns do NOT
 * reduce it — a driver who returns the plate and the ELD but keeps the dash cam
 * still shows the full flat equipment value outstanding until the set is
 * confirmed. Deliberate: simpler to operate at this scale. Per-item valuation
 * would be the finer instrument if a dispute ever turned on it.
 */

export interface EquipmentReturnConfirmation {
  id: string;
  operator_id: string;
  confirmed_at: string;
  confirmed_by: string | null;
  note: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

/** The open (non-reversed) confirmation, if there is one. */
export function openConfirmation(
  rows: EquipmentReturnConfirmation[] | null | undefined,
): EquipmentReturnConfirmation | null {
  return (rows ?? []).find(r => !r.reversed_at) ?? null;
}

/** TRUE until management confirms receipt. Mirrors the SQL of the same name. */
export function equipmentOutstanding(
  rows: EquipmentReturnConfirmation[] | null | undefined,
): boolean {
  return openConfirmation(rows) === null;
}

/** Shipment is a separate, independently readable fact. */
export function equipmentShipped(
  receipts: { direction?: string | null }[] | null | undefined,
): boolean {
  return (receipts ?? []).some(r => r.direction === 'return');
}

export function formatConfirmedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** A reversal must say why. Confirming in error is recorded, never erased. */
export function canReverse(reason: string): boolean {
  return reason.trim().length > 0;
}
