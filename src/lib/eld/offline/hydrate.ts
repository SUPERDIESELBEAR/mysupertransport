/**
 * Authenticated-load hydration for Roadside Presentation Mode.
 *
 * This is the write side of the offline cache and it DOES touch Supabase — it
 * only ever runs inside the authenticated app, never on /roadside.
 *
 * PASS B NOTE: the keyed generate-on-read below is temporary Pass A
 * scaffolding. When the offline write path lands, keyed PDFs must be cached at
 * certification time and this function must consume that single path instead
 * of keeping a second, parallel generator. The eld_document download below is
 * NOT temporary: those bytes exist only in Storage and can never be
 * regenerated on the device, so hydration remains the only path to them.
 */
import { supabase } from '@/integrations/supabase/client';
import { ELD_NOTICE_BUCKET } from '@/lib/eld/pendingNotice';
import {
  RODS_BUCKET, formatLogDate, showsDerivedTotals,
  type RodsDay, type RodsEvent,
} from '@/lib/eld/rodsTypes';
import {
  roadsideDb, requestPersistentStorage, readLocalMeta,
  type LocalMeta, type ManifestDay, type RoadsideManifest,
} from './db';
import { canDecode, DISPLAY_MIME, probeRenderability } from './renderability';
import { pruneRoadsideCache, signatureKeyForDay } from './prune';
import { ensureDayCached } from './ensureDayCached';
import { buildManifest, type ServerDayDescriptor } from './manifestBuild';
import {
  applyServerAcknowledgement,
  compareDocumentDay, compareKeyedDay, openDivergenceDates, pendingAckDates, recordDivergence,
} from './divergence';
import { enqueueDivergenceReport } from './queue/divergenceSync';
import { raiseSyncAlert } from './queue/alerts';
import { maybeWipeForDemoReset } from './demoReset';
import { windowDatesInTimezone } from './roadsideManifest';

export type HydrationPhase = 'idle' | 'running' | 'ready' | 'incomplete' | 'unavailable';

export interface HydrationProgress {
  phase: HydrationPhase;
  documentsTotal: number;
  documentsDone: number;
  cachedDays: number;
  totalDays: number;
}

type Notify = (p: HydrationProgress) => void;

const listeners = new Set<Notify>();
let current: HydrationProgress = {
  phase: 'idle', documentsTotal: 0, documentsDone: 0, cachedDays: 0, totalDays: 0,
};

export function subscribeHydration(fn: Notify): () => void {
  listeners.add(fn);
  fn(current);
  return () => { listeners.delete(fn); };
}

function emit(patch: Partial<HydrationProgress>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l(current));
}

function filenameOf(path: string): string {
  const raw = path.split('/').pop() ?? path;
  return decodeURIComponent(raw);
}

/**
 * Writes operator display identity, the home terminal timezone and the full
 * carrier record on every successful authenticated load, so /roadside can
 * render with no session and so record-creating paths have a carrier to
 * snapshot. Pass B adds sync as an additional trigger; it does not replace
 * this one.
 *
 * UPDATE SAFETY: a cached carrier is only ever replaced by a complete,
 * successful carrier_profile fetch. A failed or partial fetch leaves the
 * existing cache exactly as it was — degrading a good offline carrier record
 * into a half-written one would corrupt every log created afterwards, which is
 * strictly worse than serving yesterday's copy.
 */
async function writeLocalMeta(operatorId: string, driverName: string): Promise<LocalMeta> {
  const { data: op } = await supabase
    .from('operators')
    .select('id, user_id, unit_number, home_terminal_timezone, is_demo, demo_reset_at')
    .eq('id', operatorId)
    .maybeSingle();

  // Honour a server-side demo reset BEFORE anything else is written, so the
  // wipe cannot drop the identity row this load just refreshed. Gated on the
  // freshly fetched `is_demo`, never on the cached value.
  await maybeWipeForDemoReset({
    operatorId,
    isDemo: (op as { is_demo?: boolean } | null)?.is_demo,
    demoResetAt: (op as { demo_reset_at?: string | null } | null)?.demo_reset_at ?? null,
  });

  // Read AFTER the wipe: a pre-wipe snapshot would carry the purged demo
  // session's carrier and terminal values straight back into the new row.
  const existing = await readLocalMeta();

  const { data: lastDay } = await supabase
    .from('rods_days')
    .select('home_terminal_address')
    .eq('operator_id', operatorId)
    .not('home_terminal_address', 'is', null)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile, error: profileError } = await supabase
    .from('carrier_profile')
    // Must stay a single string literal — the generated types parse it.
    .select('legal_name, usdot_number, mc_number, main_office_address, home_terminal_address, home_terminal_timezone, fmcsa_division_state')
    .maybeSingle();

  // Complete means: fetch succeeded AND every field certify_rods_day guards on
  // is present. Anything less is treated as a failed fetch.
  const fetchedCarrier = !profileError && profile
    && profile.legal_name && profile.usdot_number && profile.mc_number
    && profile.main_office_address && profile.home_terminal_address
    && profile.home_terminal_timezone
    ? {
      carrier_name: profile.legal_name,
      carrier_usdot: profile.usdot_number,
      carrier_mc: profile.mc_number ?? '',
      carrier_main_office_address: profile.main_office_address,
      carrier_home_terminal_address: profile.home_terminal_address,
      carrier_home_terminal_timezone: profile.home_terminal_timezone,
      carrier_fmcsa_division_state: profile.fmcsa_division_state ?? '',
      carrier_cached_at: new Date().toISOString(),
    }
    : null;

  const carrier = fetchedCarrier ?? {
    // Preserve whatever was already cached; never substitute a constant here.
    carrier_name: existing?.carrier_name ?? '',
    carrier_usdot: existing?.carrier_usdot ?? '',
    carrier_mc: existing?.carrier_mc ?? '',
    carrier_main_office_address: existing?.carrier_main_office_address ?? '',
    carrier_home_terminal_address: existing?.carrier_home_terminal_address ?? '',
    carrier_home_terminal_timezone: existing?.carrier_home_terminal_timezone ?? '',
    carrier_fmcsa_division_state: existing?.carrier_fmcsa_division_state ?? '',
    carrier_cached_at: existing?.carrier_cached_at ?? null,
  };

  const meta: LocalMeta = {
    key: 'identity',
    operator_id: operatorId,
    driver_name: driverName,
    driver_user_id: op?.user_id ?? null,
    truck_number: op?.unit_number ?? null,
    ...carrier,
    home_terminal_address:
      lastDay?.home_terminal_address ?? carrier.carrier_home_terminal_address ?? null,
    home_terminal_timezone:
      op?.home_terminal_timezone || carrier.carrier_home_terminal_timezone || 'America/Chicago',
    // Sticky: a failed operator fetch must not silently un-demo the device.
    is_demo: op ? op.is_demo === true : existing?.is_demo === true,
    demo_reset_at:
      (op as { demo_reset_at?: string | null } | null)?.demo_reset_at
      ?? existing?.demo_reset_at ?? null,
    updated_at: new Date().toISOString(),
  };
  await roadsideDb.local_meta.put(meta);
  return meta;
}

/**
 * The certification signature, cached as a data URL so both the PDF and the
 * native roadside render show the same mark. Tagged 'downloaded_cache': this
 * is a copy of a server record and prunes normally.
 */
async function cacheSignature(day: RodsDay): Promise<string | null> {
  const path = day.certification_signature_path;
  if (!path) return null;
  const key = signatureKeyForDay(day.operator_id, day.log_date);
  const existing = await roadsideDb.signature_images.get(key);
  if (existing) return existing.data_url;

  const { data: signed } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
  if (!signed?.signedUrl) return null;
  const res = await fetch(signed.signedUrl);
  if (!res.ok) return null;
  const blob = await res.blob();
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
  if (!dataUrl) return null;
  await roadsideDb.signature_images.put({
    key,
    data_url: dataUrl,
    uploaded: true,
    origin: 'downloaded_cache',
    cached_at: new Date().toISOString(),
  });
  return dataUrl;
}

/**
 * Precedence case 3 support: is the cached row itself superseded server-side?
 * Only ever asked when the ids already differ, so this costs nothing in the
 * normal path. A failed read is treated as "unknown", which falls through to
 * the divergence branch rather than replacing a record on a guess.
 */
async function cachedRowIsSuperseded(cachedRowId: string): Promise<boolean> {
  const { data } = await supabase
    .from('rods_days')
    .select('status')
    .eq('id', cachedRowId)
    .maybeSingle();
  return data?.status === 'superseded';
}

/** True when the server's row legitimately replaces the cached one (case 3). */
async function isLegitimateReplacement(serverDay: RodsDay, cachedRowId: string): Promise<boolean> {
  if (serverDay.supersedes_day_id === cachedRowId) return true;
  return cachedRowIsSuperseded(cachedRowId).catch(() => false);
}

async function flagDivergence(
  logDate: string, operatorId: string, localDay: RodsDay, localEvents: RodsEvent[],
  serverRowId: string, comparison: ReturnType<typeof compareKeyedDay>,
) {
  console.error('[eld-cache] certified day diverges from the office copy', {
    log_date: logDate,
    differing: comparison.differing,
    local: comparison.local,
    server: comparison.server,
    local_row_id: localDay.id,
    server_row_id: serverRowId,
  });
  const isNew = await recordDivergence({
    logDate, operatorId, localDay, localEvents, serverRowId, comparison,
  });
  if (!isNew) return;
  // File it with the office. Queued, not called: the device that notices a
  // divergence is frequently the one that is offline.
  const row = await roadsideDb.rods_divergences.get(logDate);
  if (row) {
    await enqueueDivergenceReport(
      row,
      typeof navigator !== 'undefined' ? navigator.userAgent : null,
    ).catch(() => undefined);
  }
  await raiseSyncAlert({
    kind: 'certified_day_divergence',
    operator_id: operatorId,
    log_date: logDate,
    detail: `Local row ${localDay.id} differs from server row ${serverRowId} on: ${comparison.differing.join(', ') || 'row identity'}.`,
  });
}

/**
 * See the PRECEDENCE block on ensureDayCached — this is where it is enforced.
 * Exported for the precedence tests; not part of the module's public surface.
 */
export async function cacheKeyedDay(day: RodsDay, driverName: string) {
  const existing = await roadsideDb.rods_pdfs.get(day.log_date);
  // Case 1: certified here, not yet synced. Local wins absolutely.
  if (existing && !existing.uploaded) return;

  const cached = await roadsideDb.rods_days_cache.get(day.log_date);
  // Case 1, structured form. A day signed offline holds the local
  // certification lock before its bytes exist, and a draft with unsynced edits
  // is ahead of the server. Neither may be overwritten by a hydration pass.
  if (cached?.local_certified_at || cached?.unsynced) return;

  const { data: events } = await supabase
    .from('rods_events')
    .select('*')
    .eq('rods_day_id', day.id)
    .order('start_minute');

  const rows = (events ?? []) as unknown as RodsEvent[];

  if (cached && cached.day.id !== day.id) {
    // Cases 3 and 4: a different certified row now owns this date.
    if (!(await isLegitimateReplacement(day, cached.day.id))) {
      const cachedEvents = (await roadsideDb.rods_events_cache.get(cached.day.id))?.events ?? [];
      await flagDivergence(
        day.log_date, day.operator_id, cached.day, cachedEvents, day.id,
        compareKeyedDay(cached.day, cachedEvents, day, rows),
      );
      return;
    }
    // Legitimate amendment — fall through and replace, bytes included.
  } else if (cached && existing) {
    // Case 5: same row. Identical is the only acceptable outcome.
    const cachedEvents = (await roadsideDb.rods_events_cache.get(day.id))?.events ?? [];
    const comparison = compareKeyedDay(cached.day, cachedEvents, day, rows);
    if (comparison.differing.length > 0) {
      await flagDivergence(day.log_date, day.operator_id, cached.day, cachedEvents, day.id, comparison);
      return;
    }
    if (existing.cached_at > day.updated_at) return; // already fresh
  }

  const signatureDataUrl = await cacheSignature(day).catch(() => null);
  // Single writer — same renderer, same rows, same bytes the officer sees.
  await ensureDayCached({
    day,
    events: rows,
    driverName,
    signatureDataUrl,
    signatureOrigin: 'downloaded_cache',
    uploaded: true,
    // Hydration writes the SERVER row. It is by definition not ahead of the
    // server, and it never carries a local certification lock — a day that
    // does hold one is protected before we ever get here (precedence case 1).
    sync: { unsynced: false, version: cached?.version ?? 0, localCertifiedAt: null },
  });
}

async function cacheDocumentDay(day: RodsDay) {
  const path = day.source_document_path;
  if (!path) return;

  const existing = await roadsideDb.rods_documents.get(day.log_date);
  if (existing?.day_id && existing.day_id !== day.id) {
    // replace_rods_document supersedes exactly like an amendment does.
    if (!(await isLegitimateReplacement(day, existing.day_id))) {
      const cached = await roadsideDb.rods_days_cache.get(day.log_date);
      await flagDivergence(
        day.log_date, day.operator_id, cached?.day ?? day, [], day.id,
        compareDocumentDay(
          { certified_at: existing.certified_at, source_document_path: existing.source_path },
          day,
        ),
      );
      return;
    }
  } else if (existing?.day_id) {
    const comparison = compareDocumentDay(
      { certified_at: existing.certified_at, source_document_path: existing.source_path },
      day,
    );
    if (comparison.differing.length > 0 && existing.certified_at !== undefined) {
      const cached = await roadsideDb.rods_days_cache.get(day.log_date);
      await flagDivergence(day.log_date, day.operator_id, cached?.day ?? day, [], day.id, comparison);
      return;
    }
  }
  if (existing && existing.source_path === path && existing.size > 0 && existing.day_id === day.id) return;

  const { data: signed } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
  if (!signed?.signedUrl) return;

  const res = await fetch(signed.signedUrl);
  if (!res.ok) return;
  const blob = await res.blob();
  const bytes = await blob.arrayBuffer();
  const mime = blob.type || 'application/octet-stream';

  // Display copy first, when the uploading device made one. It is NOT trusted
  // on provenance: the encode happened on another device, and truncation, a
  // partial upload and transit corruption all happen after it. `renderable`
  // means "this device can draw it" for every consumer, the officer packet and
  // the pdf-lib merge included, so the bytes are decoded here before they are
  // cached. On an intact JPEG that costs microseconds.
  let displayBytes: ArrayBuffer | null = null;
  let displayMime: string | null = null;
  let renderable = false;

  const displayPath = day.display_document_path;
  if (displayPath) {
    const fetched = await fetchStorageBytes(displayPath);
    if (fetched && await canDecode(fetched, DISPLAY_MIME)) {
      displayBytes = fetched;
      displayMime = DISPLAY_MIME;
      renderable = true;
    }
  }

  // No display copy, or one that would not fetch or would not decode: fall
  // back to probing the ORIGINAL, exactly as before Pass B §6. Anything already
  // in Storage predates the conversion path, and a device whose codec cannot
  // read the original still lands honestly on not-renderable.
  if (!renderable) {
    const probe = await probeRenderability(bytes, mime);
    renderable = probe.renderable;
    displayBytes = probe.display_bytes;
    displayMime = probe.display_mime;
  }

  await roadsideDb.rods_documents.put({
    log_date: day.log_date,
    operator_id: day.operator_id,
    source_path: path,
    filename: filenameOf(path),
    bytes,
    mime,
    size: bytes.byteLength,
    day_id: day.id,
    certified_at: day.certified_at,
    renderable,
    display_bytes: displayBytes,
    display_mime: displayMime,
    display_conversion_failed: day.display_conversion_failed ?? false,
    cached_at: new Date().toISOString(),
  });
}

/** Signed-URL fetch that resolves to null on every failure. */
async function fetchStorageBytes(path: string): Promise<ArrayBuffer | null> {
  try {
    const { data: signed } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
    if (!signed?.signedUrl) return null;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function cacheNotice(eventId: string, noticePath: string | null) {
  if (!noticePath) return false;
  const existing = await roadsideDb.notice_pdfs.get(eventId);
  if (existing) return true;
  const { data: signed } = await supabase.storage.from(ELD_NOTICE_BUCKET).createSignedUrl(noticePath, 600);
  if (!signed?.signedUrl) return false;
  const res = await fetch(signed.signedUrl);
  if (!res.ok) return false;
  await roadsideDb.notice_pdfs.put({
    event_id: eventId,
    bytes: await res.arrayBuffer(),
    cached_at: new Date().toISOString(),
  });
  return true;
}

let inFlight: Promise<void> | null = null;

/** Runs once per authenticated app load for an operator. */
export function hydrateRoadsideCache(operatorId: string, driverName: string): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = run(operatorId, driverName).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(operatorId: string, driverName: string) {
  try {
    emit({ phase: 'running', documentsDone: 0, documentsTotal: 0 });
    await requestPersistentStorage();

    const meta = await writeLocalMeta(operatorId, driverName);
    const dates = windowDatesInTimezone(meta.home_terminal_timezone);

    const { data: rawDays } = await supabase
      .from('rods_days')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('status', 'certified')
      .gte('log_date', dates[dates.length - 1])
      .lte('log_date', dates[0]);

    const certified = (rawDays ?? []) as unknown as RodsDay[];
    const byDate = new Map(certified.map((d) => [d.log_date, d]));

    // Precedence case 2: this device holds a certified day it believes synced,
    // and the server has NO certified row for that date at all. The
    // certification was never applied or was rejected — that is the rejection
    // path, not a cache divergence. Nothing local is touched.
    for (const cached of await roadsideDb.rods_days_cache.toArray()) {
      if (cached.operator_id !== operatorId) continue;
      if (!dates.includes(cached.log_date)) continue;
      if (cached.day.status !== 'certified') continue;
      if (byDate.has(cached.log_date)) continue;
      const pdf = await roadsideDb.rods_pdfs.get(cached.log_date);
      if (!pdf?.uploaded) continue; // still queued — case 1, leave it alone
      await raiseSyncAlert({
        kind: 'certification_rejected',
        operator_id: operatorId,
        log_date: cached.log_date,
        detail: `Device holds a synced certified log for ${cached.log_date} but the office has no certified record for that date.`,
      });
    }

    const docDays = certified.filter((d) => d.record_source === 'eld_document' && d.source_document_path);
    emit({ documentsTotal: docDays.length, totalDays: dates.length });

    const keyedDays = certified.filter((d) => d.record_source === 'keyed');
    await Promise.all(keyedDays.map((d) => cacheKeyedDay(d, driverName).catch(() => undefined)));

    // Probed and downloaded in parallel: one slow or undecodable file must not
    // serialize the rest of the window.
    let done = 0;
    await Promise.all(docDays.map(async (d) => {
      try { await cacheDocumentDay(d); } catch { /* stays uncached */ }
      done += 1;
      emit({ documentsDone: done });
    }));

    const { data: events } = await supabase
      .from('eld_malfunction_events')
      .select('id, discovered_at, malfunction_code, malfunction_description, repair_deadline, device_make, device_model, notice_pdf_path')
      .eq('operator_id', operatorId)
      .eq('status', 'open')
      .order('discovered_at', { ascending: false })
      .limit(1);
    const evt = events?.[0] ?? null;
    const hasNotice = evt ? await cacheNotice(evt.id, evt.notice_pdf_path).catch(() => false) : false;

    await reconcileDivergenceAcks(operatorId);
    const diverged = await openDivergenceDates();

    // The device decides what it can show; the server only says what exists.
    // Days certified on this device and not yet synced are added by the
    // builder from the cache, so a packet is never a lap behind the driver.
    const serverDays: ServerDayDescriptor[] = certified
      .filter((d) => dates.includes(d.log_date))
      .map((d) => ({
        log_date: d.log_date,
        kind: d.record_source === 'eld_document' ? 'eld_document' : 'keyed',
        label: d.record_source === 'eld_document' ? 'On file (ELD log)' : 'Certified',
        showsTotals: d.record_source === 'eld_document' ? false : showsDerivedTotals(d),
      }));

    const manifest = await buildManifest({
      mode: 'full',
      operatorId,
      dates,
      serverDays,
      diverged,
      event: evt ? {
        id: evt.id,
        discovered_at: evt.discovered_at,
        malfunction_code: evt.malfunction_code,
        malfunction_description: evt.malfunction_description,
        repair_deadline: evt.repair_deadline,
        device_label: [evt.device_make, evt.device_model].filter(Boolean).join(' ') || null,
        has_notice: hasNotice,
      } : null,
    });
    const manifestDays = manifest.days;
    await roadsideDb.roadside_manifest.put(manifest);
    await pruneRoadsideCache(manifest);

    const cachedDays = manifestDays.filter((d) => d.cached).length;
    const expected = manifestDays.filter((d) => d.label !== 'Not certified').length;
    emit({
      phase: expected === 0 ? 'unavailable' : cachedDays === expected ? 'ready' : 'incomplete',
      cachedDays,
      totalDays: dates.length,
      documentsDone: docDays.length,
    });
  } catch {
    emit({ phase: 'unavailable' });
  }
}

export { formatLogDate };