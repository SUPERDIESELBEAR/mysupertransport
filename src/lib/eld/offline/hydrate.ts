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
import { CARRIER_LEGAL_NAME, CARRIER_MC, CARRIER_USDOT } from '@/lib/eld/constants';
import { ELD_NOTICE_BUCKET } from '@/lib/eld/pendingNotice';
import { renderRodsDay } from '@/lib/eld/renderRodsDay';
import {
  RODS_BUCKET, formatLogDate, showsDerivedTotals,
  type RodsDay, type RodsEvent,
} from '@/lib/eld/rodsTypes';
import { roadsideDb, requestPersistentStorage, type ManifestDay, type RoadsideManifest } from './db';
import { probeRenderability } from './renderability';
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
 * Writes operator display identity and the home terminal timezone on every
 * successful authenticated load, so /roadside can render with no session.
 * Pass B adds sync as an additional trigger; it does not replace this one.
 */
async function writeLocalMeta(operatorId: string, driverName: string) {
  const { data: op } = await supabase
    .from('operators')
    .select('id, user_id, unit_number, home_terminal_timezone')
    .eq('id', operatorId)
    .maybeSingle();

  const { data: lastDay } = await supabase
    .from('rods_days')
    .select('home_terminal_address')
    .eq('operator_id', operatorId)
    .not('home_terminal_address', 'is', null)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const meta = {
    key: 'identity' as const,
    operator_id: operatorId,
    driver_name: driverName,
    driver_user_id: op?.user_id ?? null,
    truck_number: op?.unit_number ?? null,
    carrier_name: CARRIER_LEGAL_NAME,
    carrier_usdot: CARRIER_USDOT,
    carrier_mc: CARRIER_MC,
    home_terminal_address: lastDay?.home_terminal_address ?? null,
    home_terminal_timezone: op?.home_terminal_timezone || 'America/Chicago',
    updated_at: new Date().toISOString(),
  };
  await roadsideDb.local_meta.put(meta);
  return meta;
}

async function cacheKeyedDay(day: RodsDay, driverName: string) {
  const existing = await roadsideDb.rods_pdfs.get(day.log_date);
  if (existing && existing.cached_at > day.updated_at) return;

  const { data: events } = await supabase
    .from('rods_events')
    .select('*')
    .eq('rods_day_id', day.id)
    .order('start_minute');

  const blob = await renderRodsDay({
    day,
    events: (events ?? []) as unknown as RodsEvent[],
    driverName,
  });
  await roadsideDb.rods_pdfs.put({
    log_date: day.log_date,
    operator_id: day.operator_id,
    bytes: await blob.arrayBuffer(),
    mime: 'application/pdf',
    uploaded: true,
    cached_at: new Date().toISOString(),
  });
}

async function cacheDocumentDay(day: RodsDay) {
  const path = day.source_document_path;
  if (!path) return;

  const existing = await roadsideDb.rods_documents.get(day.log_date);
  if (existing && existing.source_path === path && existing.size > 0) return;

  const { data: signed } = await supabase.storage.from(RODS_BUCKET).createSignedUrl(path, 600);
  if (!signed?.signedUrl) return;

  const res = await fetch(signed.signedUrl);
  if (!res.ok) return;
  const blob = await res.blob();
  const bytes = await blob.arrayBuffer();
  const mime = blob.type || 'application/octet-stream';

  const probe = await probeRenderability(bytes, mime);
  await roadsideDb.rods_documents.put({
    log_date: day.log_date,
    operator_id: day.operator_id,
    source_path: path,
    filename: filenameOf(path),
    bytes,
    mime,
    size: bytes.byteLength,
    renderable: probe.renderable,
    display_bytes: probe.display_bytes,
    display_mime: probe.display_mime,
    cached_at: new Date().toISOString(),
  });
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

/**
 * Never prune a file the current manifest references, and never prune a
 * local-only artifact that has not been uploaded yet, at any age.
 */
async function prune(manifest: RoadsideManifest) {
  const keep = new Set(manifest.days.map((d) => d.log_date));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffIso = cutoff.toISOString();

  const pdfs = await roadsideDb.rods_pdfs.toArray();
  for (const p of pdfs) {
    if (keep.has(p.log_date) || !p.uploaded || p.cached_at > cutoffIso) continue;
    await roadsideDb.rods_pdfs.delete(p.log_date);
  }
  const docs = await roadsideDb.rods_documents.toArray();
  for (const d of docs) {
    if (keep.has(d.log_date) || d.cached_at > cutoffIso) continue;
    await roadsideDb.rods_documents.delete(d.log_date);
  }
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

    const pdfKeys = new Set((await roadsideDb.rods_pdfs.toArray()).map((p) => p.log_date));
    const docs = new Map((await roadsideDb.rods_documents.toArray()).map((d) => [d.log_date, d]));

    const manifestDays: ManifestDay[] = dates.map((log_date) => {
      const day = byDate.get(log_date);
      if (!day) {
        return {
          log_date, kind: 'keyed', label: 'Not certified', cached: false,
          renderable: false, filename: null, showsTotals: false,
        };
      }
      if (day.record_source === 'eld_document') {
        const doc = docs.get(log_date);
        return {
          log_date,
          kind: 'eld_document',
          label: 'On file (ELD log)',
          // Present and openable counts as cached even when the browser cannot
          // decode it in-app — the named-card fallback still shows the file.
          cached: !!doc,
          renderable: !!doc?.renderable,
          filename: doc?.filename ?? null,
          showsTotals: false,
        };
      }
      return {
        log_date,
        kind: 'keyed',
        label: 'Certified',
        cached: pdfKeys.has(log_date),
        renderable: pdfKeys.has(log_date),
        filename: null,
        showsTotals: showsDerivedTotals(day),
      };
    });

    const manifest: RoadsideManifest = {
      key: 'current',
      operator_id: operatorId,
      days: manifestDays,
      window_start: dates[dates.length - 1],
      window_end: dates[0],
      event: evt ? {
        id: evt.id,
        discovered_at: evt.discovered_at,
        malfunction_code: evt.malfunction_code,
        malfunction_description: evt.malfunction_description,
        repair_deadline: evt.repair_deadline,
        device_label: [evt.device_make, evt.device_model].filter(Boolean).join(' ') || null,
        has_notice: hasNotice,
      } : null,
      built_at: new Date().toISOString(),
    };
    await roadsideDb.roadside_manifest.put(manifest);
    await prune(manifest);

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