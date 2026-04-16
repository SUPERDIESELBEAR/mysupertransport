/**
 * Shared helpers for equipment shipping & tracking.
 * Used by EquipmentAssignModal, EquipmentHistoryModal, and the operator-side TruckInfoCard.
 */

export const SHIPPING_CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] as const;
export type ShippingCarrier = typeof SHIPPING_CARRIERS[number];

/**
 * Build a public tracking URL for a given carrier + tracking number.
 * Returns null when no carrier or no tracking number, or for "Other".
 */
export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!carrier || !trackingNumber) return null;
  const tn = encodeURIComponent(trackingNumber.trim());
  if (!tn) return null;
  switch (carrier) {
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${tn}`;
    case 'FedEx':
      return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
    case 'DHL':
      return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${tn}`;
    default:
      return null;
  }
}

/** Truncate long tracking numbers for compact display, e.g. 1Z999AA10123456784 → 1Z999AA1… */
export function shortTracking(trackingNumber: string, headLen = 8): string {
  if (trackingNumber.length <= headLen + 1) return trackingNumber;
  return `${trackingNumber.slice(0, headLen)}…`;
}
