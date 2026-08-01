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
