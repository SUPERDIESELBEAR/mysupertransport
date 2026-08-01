/**
 * An event row that EXISTS and is EMPTY is the one shape that can put a blank
 * grid under a "Certified" header at a roadside inspection.
 *
 * It is not "not cached yet" — hydration wrote an authoritative-looking empty
 * set — so the PDF for that date is no more trustworthy than the rows. Neither
 * the grid nor the PDF embed is an honest recovery: the day must read as
 * unavailable, per Stage 3 §10.2's rule that gaps are shown, not concealed.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { RodsDay } from '@/lib/eld/rodsTypes';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { roadsideDb } = await import('../db');
const { buildManifest } = await import('../manifestBuild');
const { putCachedEvents, flushEmptySegmentAlerts } = await import('../cache');
const { undeliverableAlertCount, resetUndeliverableAlertCount } = await import('../queue/alerts');
const RoadsideDayView = (await import('@/components/eld/RoadsideDayView')).default;

const DATE = '2026-07-02';

function day(): RodsDay {
  return {
    id: 'day-1', operator_id: 'op-1', log_date: DATE, record_source: 'keyed',
    status: 'certified', locked: true, is_reconstructed: false, supersedes_day_id: null,
    amendment_reason: null, total_off_duty_minutes: 0, total_sleeper_minutes: 0,
    total_driving_minutes: 0, total_on_duty_minutes: 0,
    certified_at: '2026-08-01T14:07:16.000Z', updated_at: '2026-08-01T14:07:16.000Z',
    created_at: '2026-08-01T14:07:16.000Z', source_document_path: null, pdf_path: null,
    certification_legal_name: 'A Driver', certification_signature_path: null,
  } as unknown as RodsDay;
}

async function seedEmptyEventSet(withPdf: boolean) {
  await roadsideDb.rods_days_cache.put({
    log_date: DATE, operator_id: 'op-1', day: day(), cached_at: '2026-08-01T14:08:00.000Z',
    unsynced: false, version: 0, local_certified_at: '2026-08-01T14:07:16.000Z',
    sync_rejected: false, sync_stalled: false,
  });
  await roadsideDb.rods_events_cache.put({
    rods_day_id: 'day-1', log_date: DATE, events: [],
    cached_at: '2026-08-01T14:08:00.000Z', unsynced: false, version: 0,
  });
  if (withPdf) {
    await roadsideDb.rods_pdfs.put({
      log_date: DATE, operator_id: 'op-1', bytes: new ArrayBuffer(4),
      mime: 'application/pdf', uploaded: true, cached_at: '2026-08-01T14:08:00.000Z',
    });
  }
}

beforeEach(async () => {
  await roadsideDb.open();
  await Promise.all([
    roadsideDb.rods_days_cache.clear(), roadsideDb.rods_events_cache.clear(),
    roadsideDb.rods_pdfs.clear(), roadsideDb.roadside_manifest.clear(),
  ]);
  await roadsideDb.sync_queue.clear();
  resetUndeliverableAlertCount();
  localStorage.clear();
});

describe('manifest', () => {
  it('marks a keyed day with an empty event set unavailable, even with a PDF on the device', async () => {
    await seedEmptyEventSet(true);
    const manifest = await buildManifest({
      mode: 'full', operatorId: 'op-1', dates: [DATE], serverDays: [],
    });
    const entry = manifest.days.find((d) => d.log_date === DATE)!;
    expect(entry.renderable).toBe(false);
    expect(entry.printable).toBe(false);
    // `cached` gates print, email-merge and download as well as the view.
    expect(entry.cached).toBe(false);
  });

  it('still serves the PDF when there is NO event row at all', async () => {
    await seedEmptyEventSet(true);
    await roadsideDb.rods_events_cache.clear();
    const manifest = await buildManifest({
      mode: 'full', operatorId: 'op-1', dates: [DATE], serverDays: [],
    });
    const entry = manifest.days.find((d) => d.log_date === DATE)!;
    expect(entry.cached).toBe(true);
    expect(entry.printable).toBe(true);
    expect(entry.renderable).toBe(false);
  });
});

describe('roadside day view', () => {
  it('shows the unavailable state instead of a blank grid or a PDF embed', async () => {
    await seedEmptyEventSet(true);
    // A STALE manifest that still claims the day: the view must refuse on its
    // own reading of the cache, not on the manifest's word.
    render(<RoadsideDayView day={{
      log_date: DATE, kind: 'keyed', label: 'Certified', cached: true,
      renderable: true, printable: true, filename: null, showsTotals: true, diverged: false,
    }} />);

    await waitFor(() => {
      expect(screen.getByText(/No certified record is stored on this device/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('roadside-native-day')).toBeNull();
    expect(screen.queryByTestId('roadside-native-grid')).toBeNull();
    expect(document.querySelector('object, iframe, embed')).toBeNull();
    expect(JSON.parse(localStorage.getItem('roadside_empty_event_set') ?? '[]')).toContain(DATE);
    expect(localStorage.getItem('roadside_native_fallback')).toBeNull();
  });
});

/**
 * A counter for a condition that should be impossible is a counter nobody
 * reads. The one time hydration persists a certified day with no segments on a
 * real phone, someone has to find out that day — not from a dashboard later.
 */
describe('empty-segment alert', () => {
  const base = {
    rods_day_id: 'day-1', log_date: DATE, operator_id: 'op-1',
    unsynced: false, version: 1,
  };

  async function alertEntries() {
    const all = await roadsideDb.sync_queue.toArray();
    return all.filter((e) => e.kind === 'raise_sync_alert');
  }

  it('raises for a hydration that writes a certified day with no segments', async () => {
    const { emptySegments } = await putCachedEvents({
      ...base, events: [], provenance: 'hydration',
      day_status: 'certified', local_certified_at: null,
    });
    await flushEmptySegmentAlerts(emptySegments);

    const raised = await alertEntries();
    expect(raised).toHaveLength(1);
    const payload = raised[0]!.payload as Record<string, unknown>;
    expect(payload.alert_kind).toBe('certified_day_no_segments');
    expect(payload.log_date).toBe(DATE);
    expect(JSON.parse(payload.detail as string).provenance).toBe('hydration');
  });

  /**
   * The case a guard placed in ensureDayCached would have missed entirely:
   * commitCertification writes the event cache directly, and its day row is
   * still 'draft' server-side — the lock is local_certified_at.
   */
  it('raises for a local certification that commits no segments', async () => {
    const { emptySegments } = await putCachedEvents({
      ...base, events: [], provenance: 'local_certification',
      day_status: 'draft', local_certified_at: '2026-08-01T14:07:16.000Z',
    });
    await flushEmptySegmentAlerts(emptySegments);

    const raised = await alertEntries();
    expect(raised).toHaveLength(1);
    expect(JSON.parse((raised[0]!.payload as Record<string, unknown>).detail as string).provenance)
      .toBe('local_certification');
  });

  it('stays silent for a certified day that has segments', async () => {
    const { emptySegments } = await putCachedEvents({
      ...base,
      events: [{ id: 'e1', rods_day_id: 'day-1', start_minute: 0, end_minute: 1440,
        duty_status: 1 } as never],
      provenance: 'hydration', day_status: 'certified', local_certified_at: null,
    });
    expect(emptySegments).toBeNull();
    await flushEmptySegmentAlerts(emptySegments);
    expect(await alertEntries()).toHaveLength(0);
  });

  it('stays silent for an empty DRAFT — a day in progress is not an anomaly', async () => {
    const { emptySegments } = await putCachedEvents({
      ...base, events: [], provenance: 'editor',
      day_status: 'draft', local_certified_at: null,
    });
    expect(emptySegments).toBeNull();
    await flushEmptySegmentAlerts(emptySegments);
    expect(await alertEntries()).toHaveLength(0);
  });

  /**
   * The reason detection is a return value and not a module-level list: an
   * abort must not leave an entry behind for the next caller's flush to raise.
   */
  it('raises nothing when the enclosing transaction aborts', async () => {
    await expect(roadsideDb.transaction(
      'rw', roadsideDb.rods_days_cache, roadsideDb.rods_events_cache, async () => {
        await putCachedEvents({
          ...base, events: [], provenance: 'hydration',
          day_status: 'certified', local_certified_at: null,
        });
        throw new Error('aborted after the put');
      },
    )).rejects.toThrow(/aborted after the put/);

    expect(await roadsideDb.rods_events_cache.count()).toBe(0);
    expect(await alertEntries()).toHaveLength(0);
  });

  /** Concurrent callers must not drain, or be attributed, each other's value. */
  it('keeps interleaved callers separate', async () => {
    const hydration = await putCachedEvents({
      ...base, events: [], provenance: 'hydration',
      day_status: 'certified', local_certified_at: null,
    });
    const certification = await putCachedEvents({
      ...base, rods_day_id: 'day-2', log_date: '2026-07-03', events: [],
      provenance: 'local_certification', day_status: 'draft',
      local_certified_at: '2026-08-01T14:07:16.000Z',
    });

    // The certification finishes first and must raise ONLY its own.
    await flushEmptySegmentAlerts(certification.emptySegments);
    let raised = await alertEntries();
    expect(raised).toHaveLength(1);
    expect(raised[0]!.payload).toMatchObject({ log_date: '2026-07-03' });

    await flushEmptySegmentAlerts(hydration.emptySegments);
    raised = await alertEntries();
    expect(raised.map((e) => (e.payload as Record<string, unknown>).log_date).sort())
      .toEqual(['2026-07-02', '2026-07-03']);
  });

  it('leaves the cached rows intact when the alert cannot be delivered', async () => {
    // No operator_id: raise_sync_alert cannot attribute the write, so the
    // alert is counted as undeliverable rather than queued — and the segments
    // it describes are still on the device.
    const { emptySegments } = await putCachedEvents({
      ...base, operator_id: '', events: [], provenance: 'hydration',
      day_status: 'certified', local_certified_at: null,
    });
    await flushEmptySegmentAlerts(emptySegments);

    expect(await alertEntries()).toHaveLength(0);
    expect(undeliverableAlertCount()).toBe(1);
    expect(await roadsideDb.rods_events_cache.get('day-1')).toBeTruthy();
  });
});
