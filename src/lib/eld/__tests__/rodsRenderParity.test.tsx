/**
 * Parity between the native roadside render and the printed PDF.
 *
 * Shared geometry covers the grid, so the grid assertion checks the SVG's
 * actual coordinates against the same geometry functions the PDF uses. The
 * §395.8 header fields, annotations, RECAP and totals have no shared drawing
 * code, so they are asserted explicitly.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoadsideDayRender from '@/components/eld/RoadsideDayRender';
import {
  carrierTimeZoneLabel, rodsAnnotations, rodsHeaderFields, rodsRecapRows,
} from '@/lib/eld/rodsHeaderFields';
import { minuteToX, rowCenterOffset, formatMinutes, GRID_W, ROW_H } from '@/lib/eld/rodsGridGeometry';
import { statusTotals } from '@/lib/eld/rodsValidation';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

const DRIVER = 'Marcus Mueller';

const day: RodsDay = {
  id: 'day-1',
  operator_id: 'op-1',
  log_date: '2026-07-14',
  record_source: 'keyed',
  status: 'certified',
  locked: true,
  is_reconstructed: true,
  supersedes_day_id: 'day-0',
  amendment_reason: 'Missed a stop',
  bol_photo_path: null,
  carrier_name: 'SUPERTRANSPORT LLC',
  carrier_usdot: '1234567',
  carrier_mc: 'MC-7654',
  home_terminal_address: '100 Terminal Way, Kansas City, MO',
  main_office_address: '605 Madison St, Pleasant Hill, MO 64080',
  home_terminal_timezone: 'America/Chicago',
  period_start_time: '00:00:00',
  truck_number: '4412',
  trailer_numbers: 'T-900',
  co_driver_name: 'None',
  shipping_document_no: 'BOL-55512',
  from_location: 'Kansas City, MO',
  to_location: 'Des Moines, IA',
  total_miles_driving_today: 412,
  total_mileage_today: 430,
  recap_on_duty_today: '11:30',
  recap_last_7_days: '58:15',
  recap_available_tomorrow: '11:45',
  recap_last_8_days: '62:00',
  total_off_duty_minutes: 0,
  total_sleeper_minutes: 0,
  total_driving_minutes: 0,
  total_on_duty_minutes: 0,
  source_document_path: null,
  pdf_path: null,
  certified_at: '2026-07-15T02:10:00.000Z',
  certification_legal_name: 'Marcus A. Mueller',
  certification_signature_path: 'op-1/2026-07-14/sig.png',
  created_at: '2026-07-14T06:00:00.000Z',
  updated_at: '2026-07-15T02:10:00.000Z',
};

const events: RodsEvent[] = [
  { id: 'e1', rods_day_id: 'day-1', start_minute: 0, end_minute: 360, duty_status: 1, city: 'Kansas City', state: 'MO', remarks: null, is_short_period: false },
  { id: 'e2', rods_day_id: 'day-1', start_minute: 360, end_minute: 375, duty_status: 4, city: 'Kansas City', state: 'MO', remarks: 'Pre-trip', is_short_period: true },
  { id: 'e3', rods_day_id: 'day-1', start_minute: 375, end_minute: 900, duty_status: 3, city: 'Bethany', state: 'MO', remarks: null, is_short_period: false },
  // Deliberate gap 900–960: no connector may be drawn across it.
  { id: 'e4', rods_day_id: 'day-1', start_minute: 960, end_minute: 1440, duty_status: 2, city: 'Des Moines', state: 'IA', remarks: null, is_short_period: false },
  // Unfinished — must not be drawn on either surface.
  { id: 'e5', rods_day_id: 'day-1', start_minute: 1200, end_minute: null, duty_status: null, city: null, state: null, remarks: null, is_short_period: null },
];

const ORIGINAL_CERTIFIED = '2026-07-14T23:00:00.000Z';

function renderNative() {
  return render(
    <RoadsideDayRender
      day={day}
      events={events}
      driverName={DRIVER}
      originalCertifiedAt={ORIGINAL_CERTIFIED}
      signatureDataUrl={null}
    />,
  );
}

describe('native roadside render / PDF parity', () => {
  it('emits every §395.8 header field, in the printed order', () => {
    renderNative();
    const fields = rodsHeaderFields(day, DRIVER);
    expect(fields).toHaveLength(13);
    // The three fields added for §395.8 completeness must actually carry the
    // snapshotted values, not just exist as empty labels.
    expect(fields.find((f) => f.label === 'Main office address')?.value)
      .toBe('605 Madison St, Pleasant Hill, MO 64080');
    expect(fields.find((f) => f.label === 'Total mileage today')?.value).toBe('430');
    expect(fields.find((f) => f.label === '24-hour period begins')?.value)
      .toBe('12:00 AM — Central Daylight Time');

    const rendered = Array.from(
      screen.getByTestId('roadside-header-fields').querySelectorAll('dt'),
    ).map((dt) => ({
      label: dt.textContent,
      value: dt.nextElementSibling?.textContent,
    }));

    expect(rendered).toEqual(
      fields.map((f) => ({ label: f.label, value: f.value || '—' })),
    );
  });

  it('names the home terminal time standard, and never throws on a bad zone', () => {
    // Resolved at noon local: a July date in Chicago is daylight time.
    expect(carrierTimeZoneLabel('America/Chicago', '2026-07-14')).toBe('Central Daylight Time');
    // …and the same zone in January is standard time.
    expect(carrierTimeZoneLabel('America/Chicago', '2026-01-14')).toBe('Central Standard Time');
    // A blank zone yields a blank label rather than an exception.
    expect(carrierTimeZoneLabel(null, '2026-07-14')).toBe('');
    expect(carrierTimeZoneLabel(undefined, '2026-07-14')).toBe('');
    // An unknown zone falls back to the raw stored value. A roadside screen
    // showing 'Not/AZone' is recoverable; a blank screen is not.
    expect(carrierTimeZoneLabel('Not/AZone', '2026-07-14')).toBe('Not/AZone');
  });

  it('shows the same RECONSTRUCTED / AMENDED annotations the PDF draws', () => {
    renderNative();
    const notes = rodsAnnotations(day, ORIGINAL_CERTIFIED);
    expect(notes).toHaveLength(2);
    for (const note of notes) expect(screen.getByText(note)).toBeInTheDocument();
  });

  it('shows RECAP A–D exactly as entered', () => {
    renderNative();
    const recap = screen.getByTestId('roadside-recap');
    for (const row of rodsRecapRows(day)) {
      expect(recap.textContent).toContain(row.label);
      expect(recap.textContent).toContain(row.value);
    }
  });

  it('totals each duty line the same way the PDF does', () => {
    renderNative();
    const totals = statusTotals(events);
    const expected = [totals.off, totals.sleeper, totals.driving, totals.onDuty];
    expected.forEach((mins, i) => {
      expect(screen.getByTestId(`roadside-total-${i + 1}`).textContent).toBe(formatMinutes(mins));
    });
  });

  it('lists remarks and short periods like the printed REMARKS block', () => {
    renderNative();
    const remarks = screen.getByTestId('roadside-remarks').textContent ?? '';
    expect(remarks).toContain('Pre-trip');
    expect(remarks).toContain('Short period:');
    expect(remarks).toContain('Des Moines, IA');
  });

  it('places segments on the shared grid geometry', () => {
    renderNative();
    const svg = screen.getByTestId('roadside-native-grid');
    const viewBox = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    // labelW + GRID_W + totalsW; the label offset is whatever the SVG uses,
    // so derive it rather than hardcoding it here.
    const seg = svg.querySelector('[data-testid="roadside-segment-e1"]')!;
    const labelW = Number(seg.getAttribute('x1')) - minuteToX(0);
    const topPad = Number(seg.getAttribute('y1')) - rowCenterOffset(1);

    expect(viewBox[2]).toBeGreaterThanOrEqual(labelW + GRID_W);

    for (const e of events.filter((x) => x.end_minute !== null && x.duty_status !== null)) {
      const line = svg.querySelector(`[data-testid="roadside-segment-${e.id}"]`)!;
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(labelW + minuteToX(e.start_minute), 6);
      expect(Number(line.getAttribute('x2'))).toBeCloseTo(labelW + minuteToX(e.end_minute as number), 6);
      const y = topPad + rowCenterOffset(e.duty_status as 1 | 2 | 3 | 4);
      expect(Number(line.getAttribute('y1'))).toBeCloseTo(y, 6);
      expect(Number(line.getAttribute('y2'))).toBeCloseTo(y, 6);
    }
    expect(ROW_H).toBeGreaterThan(0);
  });

  it('never draws an unfinished entry', () => {
    renderNative();
    expect(
      screen.getByTestId('roadside-native-grid').querySelector('[data-testid="roadside-segment-e5"]'),
    ).toBeNull();
  });

  it('draws no connector across a gap', () => {
    renderNative();
    const svg = screen.getByTestId('roadside-native-grid');
    const e4x = Number(svg.querySelector('[data-testid="roadside-segment-e4"]')!.getAttribute('x1'));
    const verticals = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2')
        && Number(l.getAttribute('strokeWidth') ?? l.getAttribute('stroke-width')) === 1.6,
    );
    expect(verticals.some((l) => Number(l.getAttribute('x1')) === e4x)).toBe(false);
    // …but the contiguous 06:00 change does get one.
    const e2x = Number(svg.querySelector('[data-testid="roadside-segment-e2"]')!.getAttribute('x1'));
    expect(verticals.some((l) => Number(l.getAttribute('x1')) === e2x)).toBe(true);
  });
});