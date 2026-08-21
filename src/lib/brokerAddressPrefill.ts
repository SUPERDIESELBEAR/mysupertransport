import type { BrokerAddressSource, ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { toTitleCase } from '@/lib/textNormalize';

/**
 * The broker address printed on a rate confirmation is usually a remit-to/bill-to
 * address rather than a corporate one. The `brokers` table holds a single address,
 * so the provenance is preserved as a line appended to the broker's notes — that
 * way a record read months later still says which kind of address is stored.
 */

const SOURCE_LABELS: Record<BrokerAddressSource, string> = {
  remit_to: 'Remit To block',
  bill_to: 'Bill To block',
  letterhead: 'letterhead',
};

export interface BrokerAddressPrefill {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  /** Human label for the block the address came from, or null when nothing was captured. */
  sourceLabel: string | null;
  /** Provenance line to append to the broker's notes, or null when no address was captured. */
  note: string | null;
}

/** M/D/YY in US Central — the operating timezone for this carrier. */
function centralShortDate(now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: '2-digit',
  }).format(now);
}

/** A low-confidence value is dropped: the dispatcher types it rather than trusting a guess. */
function usable(field: { value: string | null; confidence: string } | undefined): string {
  if (!field || field.confidence === 'low') return '';
  return (field.value ?? '').trim();
}

export function brokerAddressPrefill(
  broker: ParsedRateConfirmation['broker'], now: Date = new Date(),
): BrokerAddressPrefill {
  const address_line1 = toTitleCase(usable(broker.address_line1));
  const address_line2 = usable(broker.address_line2);
  const city = toTitleCase(usable(broker.city));
  const state = usable(broker.state).toUpperCase().slice(0, 2);
  const zip = usable(broker.zip);

  const captured = !!(address_line1 || city || state || zip);
  const source = broker.address_source;
  const sourceLabel = captured && source ? SOURCE_LABELS[source] : null;

  return {
    address_line1,
    address_line2,
    city,
    state,
    zip,
    sourceLabel,
    note: sourceLabel
      ? `Address captured from ${sourceLabel} on rate confirmation, ${centralShortDate(now)}.`
      : null,
  };
}

/** Appends a provenance line without ever replacing what is already in notes. */
export function appendNote(existing: string | null | undefined, note: string | null): string {
  const base = (existing ?? '').trim();
  if (!note) return base;
  if (base.includes(note)) return base;
  return base ? `${base}\n${note}` : note;
}
