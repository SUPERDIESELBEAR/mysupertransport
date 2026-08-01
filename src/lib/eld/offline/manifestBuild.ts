/**
 * Builds the roadside manifest from what is on the device.
 *
 * Split out of hydrate.ts because the certification path has to rebuild the
 * manifest INSIDE the transaction that writes the local certification lock.
 * Leaving it to the next hydration pass meant a driver who signed offline and
 * was stopped ten minutes later handed an officer a packet that said "Not
 * certified" for a day they had signed. The manifest is the officer-facing
 * index; it has to be true the instant the driver signs.
 *
 * Must not import the Supabase client — the certify path reaches this from
 * code that also runs offline, and /roadside reads what it writes.
 */
import {
  roadsideDb, readLocalMeta,
  type ManifestDay, type RoadsideManifest,
} from './db';
import { windowDatesInTimezone } from './roadsideManifest';

/** What the server said about one date. Hydration supplies these; nothing else does. */
export interface ServerDayDescriptor {
  log_date: string;
  kind: 'keyed' | 'eld_document';
  label: string;
  showsTotals: boolean;
}

export interface BuildManifestCommon {
  operatorId: string;
  /** Open, unresolved divergences, by date. */
  diverged?: Set<string>;
  event?: RoadsideManifest['event'];
}

export interface BuildFullInput extends BuildManifestCommon {
  mode: 'full';
  /** The 8-day window, newest first. */
  dates: string[];
  serverDays: ServerDayDescriptor[];
}

export interface BuildUpsertDayInput extends BuildManifestCommon {
  mode: 'upsert-day';
  /** The single date that just changed on this device. */
  logDate: string;
  /** Overrides the timezone window when the caller already knows it. */
  dates?: string[];
}

export type BuildManifestInput = BuildFullInput | BuildUpsertDayInput;

function notCertified(log_date: string): ManifestDay {
  return {
    log_date, kind: 'keyed', label: 'Not certified', cached: false,
    renderable: false, printable: false, filename: null, showsTotals: false, diverged: false,
  };
}

/**
 * Describe one date from the device's own stores.
 *
 * `renderable` for a keyed day keys on the STRUCTURED ROWS, not the PDF. The
 * roadside view renders keyed days natively from rods_days_cache +
 * rods_events_cache; the PDF is only ever print and email. A day certified
 * offline has rows immediately and bytes immediately after, but tying
 * renderable to the PDF made the native view refuse to draw a log it had every
 * row for.
 */
async function localDay(
  logDate: string,
  descriptor: ServerDayDescriptor | undefined,
  diverged: Set<string>,
): Promise<ManifestDay | null> {
  const cached = await roadsideDb.rods_days_cache.get(logDate);
  const doc = await roadsideDb.rods_documents.get(logDate);
  const pdf = await roadsideDb.rods_pdfs.get(logDate);

  const kind = descriptor?.kind
    ?? (cached?.day.record_source === 'eld_document' ? 'eld_document' : 'keyed');

  if (kind === 'eld_document') {
    if (!descriptor && !doc) return null;
    return {
      log_date: logDate,
      kind: 'eld_document',
      label: descriptor?.label ?? 'On file (ELD log)',
      cached: !!doc,
      renderable: !!doc?.renderable,
      printable: !!doc,
      filename: doc?.filename ?? null,
      showsTotals: false,
      diverged: diverged.has(logDate),
    };
  }

  const locallyCertified = !!cached?.local_certified_at;
  const serverCertified = !!descriptor;
  if (!locallyCertified && !serverCertified) return null;

  const events = cached ? await roadsideDb.rods_events_cache.get(cached.day.id) : undefined;
  const hasRows = !!cached && (events?.events.length ?? 0) > 0;

  /**
   * An event row that EXISTS and is EMPTY is not "not cached yet" — it is
   * hydration having written an authoritative-looking empty set for a day the
   * driver certified. The PDF for that date is no more trustworthy than the
   * rows, so the day is neither renderable nor printable and is not offered
   * for print, email-merge or download: the tile reads the same as any day
   * whose bytes are unavailable. Distinct from NO event row, which is the
   * legitimate pre-structured-cache case that still serves the PDF.
   */
  const emptyEventSet = !!cached && !!events && events.events.length === 0;
  if (emptyEventSet) {
    return {
      log_date: logDate,
      kind: 'keyed',
      label: 'Certified',
      cached: false,
      renderable: false,
      printable: false,
      filename: null,
      showsTotals: false,
      diverged: diverged.has(logDate),
    };
  }

  return {
    log_date: logDate,
    kind: 'keyed',
    label: 'Certified',
    // Bytes OR rows: either is a record the officer can be shown.
    cached: hasRows || !!pdf,
    renderable: hasRows,
    // Print and email need the PDF; the native render does not.
    printable: !!pdf,
    filename: null,
    showsTotals: descriptor?.showsTotals
      ?? (cached ? cached.day.record_source === 'keyed' : false),
    diverged: diverged.has(logDate),
  };
}

/**
 * Build (or surgically update) the manifest.
 *
 * 'full'       — hydration. Every date in the window is recomputed from the
 *                server descriptors plus whatever the device holds, so a day
 *                certified locally and not yet synced still appears.
 * 'upsert-day' — certification. Recomputes ONE date and leaves every other
 *                entry byte-for-byte as it was. It must not downgrade days it
 *                cannot see in the cache: an entry for a day whose bytes were
 *                legitimately pruned is still a true statement that the record
 *                exists, and rewriting it to "Not certified" from a code path
 *                that never looked at the server would be a lie told to an
 *                officer.
 */
export async function buildManifest(input: BuildManifestInput): Promise<RoadsideManifest> {
  const diverged = input.diverged ?? new Set<string>();

  if (input.mode === 'full') {
    const byDate = new Map(input.serverDays.map((d) => [d.log_date, d]));
    const days: ManifestDay[] = [];
    for (const date of input.dates) {
      // eslint-disable-next-line no-await-in-loop
      const day = await localDay(date, byDate.get(date), diverged);
      days.push(day ?? notCertified(date));
    }
    return {
      key: 'current',
      operator_id: input.operatorId,
      days,
      window_start: input.dates[input.dates.length - 1],
      window_end: input.dates[0],
      event: input.event ?? null,
      built_at: new Date().toISOString(),
    };
  }

  const existing = await roadsideDb.roadside_manifest.get('current');
  const updated = await localDay(input.logDate, undefined, diverged);

  if (!existing || existing.operator_id !== input.operatorId) {
    // First certification on a device that has never hydrated — offline
    // onboarding, or a reinstall in a dead zone. There is no manifest to merge
    // into, so write the WHOLE window rather than a one-day manifest: a packet
    // that lists a single date reads as though the other seven do not exist,
    // which is a worse answer at the roadside than "Not certified".
    const meta = await readLocalMeta();
    const dates = input.dates
      ?? windowDatesInTimezone(meta?.carrier_home_terminal_timezone || 'America/Chicago');
    const days: ManifestDay[] = [];
    for (const date of dates) {
      // eslint-disable-next-line no-await-in-loop
      const day = date === input.logDate ? updated : await localDay(date, undefined, diverged);
      days.push(day ?? notCertified(date));
    }
    return {
      key: 'current',
      operator_id: input.operatorId,
      days,
      window_start: dates[dates.length - 1],
      window_end: dates[0],
      event: input.event ?? null,
      built_at: new Date().toISOString(),
    };
  }

  const inWindow = existing.days.some((d) => d.log_date === input.logDate)
    || (input.logDate <= existing.window_end && input.logDate >= existing.window_start);
  // Certifying a day outside the current 8-day window is legitimate (a late
  // reconstruction) but it does not belong in this packet. No-op rather than
  // widening the window from a path that cannot see the server.
  if (!inWindow || !updated) return existing;

  const days = existing.days.some((d) => d.log_date === input.logDate)
    ? existing.days.map((d) => (d.log_date === input.logDate ? updated : d))
    : [...existing.days, updated].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));

  return { ...existing, days, built_at: new Date().toISOString() };
}