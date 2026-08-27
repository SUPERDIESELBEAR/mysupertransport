import { CARRIER_TIMEZONE } from '@/lib/carrierTimezone';
/**
 * Formatters for driver binder share bodies (email + SMS).
 *
 * Recipients receive a clean, numbered/bulleted layout instead of a run-on of
 * `Title: <long-url>` lines. Timestamps are rendered in US Central Time per
 * project convention.
 */

export interface ShareItem {
  title: string;
  url: string;
}

export interface BuildShareArgs {
  items: ShareItem[];
  driverName: string;
  unitNumber?: string | null;
  channel: 'email' | 'sms';
  /** Optional overflow URL to use when SMS has too many items. */
  overflowUrl?: string | null;
}

export interface ShareBody {
  subject: string;
  body: string;
}

function centralTimestamp(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CARRIER_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date()) + ' CT';
  } catch {
    return new Date().toLocaleString();
  }
}

function unitTag(unitNumber?: string | null): string {
  if (!unitNumber) return '';
  return ` (Unit ${unitNumber})`;
}

function buildEmail({ items, driverName, unitNumber }: BuildShareArgs): ShareBody {
  const isSingle = items.length === 1;
  const subject = isSingle
    ? `SuperTransport — ${driverName} — ${items[0].title}`
    : `SuperTransport — Roadside Documents for ${driverName}${unitTag(unitNumber)}`;

  const intro = isSingle
    ? `Please find the roadside document for ${driverName}${unitTag(unitNumber)} below. The link opens a secure, time-limited view of the requested document.`
    : `Please find the roadside documents for ${driverName}${unitTag(unitNumber)} below. Each link opens a secure, time-limited view of the requested document.`;

  // One document per line. Mail clients treat plain text as "flowed" and
  // re-join single newlines, so each item keeps its URL on the same line and
  // items are separated by a blank line (the only break clients preserve).
  const listLines = items
    .map((it, i) => `${i + 1}. ${it.title} — ${it.url}`)
    .join('\n\n');

  const body = [
    'Hello,',
    '',
    intro,
    '',
    `DOCUMENTS (${items.length})`,
    '',
    listLines,
    '',
    `Shared: ${centralTimestamp()}`,
    '',
    'From: SUPERTRANSPORT — Digital Inspection Binder',
    '',
    'Powered by SUPERDRIVE',
  ].join('\n');

  return { subject, body };
}

function buildSms({ items, driverName, unitNumber, overflowUrl }: BuildShareArgs): ShareBody {
  const header = `SuperTransport — ${driverName}${unitTag(unitNumber)}`;

  // Fall back to a single summary link when there are too many items to fit
  // comfortably in an SMS.
  if (items.length > 3 && overflowUrl) {
    const body = [
      header,
      `${items.length} roadside documents:`,
      overflowUrl,
    ].join('\n');
    return { subject: header, body };
  }

  if (items.length === 1) {
    const body = [header, items[0].title, items[0].url].join('\n');
    return { subject: header, body };
  }

  const bulletBlocks = items
    .map((it) => `• ${it.title}\n  ${it.url}`)
    .join('\n\n');

  const body = [
    header,
    `Roadside docs (${items.length}):`,
    '',
    bulletBlocks,
  ].join('\n');

  return { subject: header, body };
}

export function buildShareBodies(args: BuildShareArgs): ShareBody {
  return args.channel === 'email' ? buildEmail(args) : buildSms(args);
}

/** Ask the backend for a short code for the given share token. */
export async function resolveShortUrl(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  origin: string,
  shareToken: string,
  fallbackUrl: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_short_link', { _share_token: shareToken });
    if (error || typeof data !== 'string' || !data) return fallbackUrl;
    return `${origin}/s/${data}`;
  } catch {
    return fallbackUrl;
  }
}