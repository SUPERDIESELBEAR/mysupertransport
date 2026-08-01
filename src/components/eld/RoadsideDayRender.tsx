/**
 * A certified keyed day, drawn natively.
 *
 * This is the display path at the roadside — there is no PDF viewer, no blob
 * URL and no iframe anywhere in it, so the entire class of embedded-viewer
 * failures cannot happen on the one screen that must not fail. The generated
 * PDF remains the artifact for print, email and device download.
 *
 * Geometry comes from rodsGridGeometry and the header/RECAP fields from
 * rodsHeaderFields — the same two modules the PDF renderer uses, so the two
 * outputs agree by construction. See rodsRenderParity.test.tsx.
 */
import { useMemo } from 'react';
import {
  GRID_H, GRID_W, ROW_H, STATUS_LINES, STATUS_LABEL_LINES, LABEL_GUTTER_W,
  formatClock, formatMinutes, hourLabel, hourWidth, isMajorHour, minuteToX, rowCenterOffset,
} from '@/lib/eld/rodsGridGeometry';
import {
  rodsAnnotations, rodsCertifiedAtLabel, rodsHeaderFields, rodsRecapRows,
} from '@/lib/eld/rodsHeaderFields';
import { statusTotals } from '@/lib/eld/rodsValidation';
import { isCompleteEvent, type RodsDay, type RodsEvent } from '@/lib/eld/rodsTypes';
import DemoWatermarkOverlay from './DemoWatermarkOverlay';

const INK = '#0D0D0D';
const MUTED = '#6B6B6B';
const RULE = '#DCDCDC';
const RED = '#C0392B';

export default function RoadsideDayRender({
  day,
  events,
  driverName,
  originalCertifiedAt = null,
  signatureDataUrl = null,
}: {
  day: RodsDay;
  events: RodsEvent[];
  driverName: string;
  originalCertifiedAt?: string | null;
  signatureDataUrl?: string | null;
}) {
  // Only finished entries are drawable. Half an entry must never become a line.
  const drawable = useMemo(
    () => [...events].filter(isCompleteEvent).sort((a, b) => a.start_minute - b.start_minute),
    [events],
  );
  const totals = useMemo(() => statusTotals(drawable), [drawable]);
  const annotations = rodsAnnotations(day, originalCertifiedAt);
  const fields = rodsHeaderFields(day, driverName);
  const recap = rodsRecapRows(day);

  const remarks: string[] = drawable.map(
    (e) => `${formatClock(e.start_minute)} — ${STATUS_LINES[(e.duty_status as number) - 1].slice(3)} — ${e.city ?? ''}, ${e.state ?? ''}${e.remarks ? ` — ${e.remarks}` : ''}`,
  );
  for (const e of drawable.filter((s) => s.is_short_period)) {
    remarks.push(
      `Short period: ${formatClock(e.start_minute)}–${formatClock(e.end_minute as number)} (${(e.end_minute as number) - e.start_minute} min) at ${e.city ?? ''}, ${e.state ?? ''}`,
    );
  }

  const totalsByLine = [totals.off, totals.sleeper, totals.driving, totals.onDuty];

  return (
    <article data-testid="roadside-native-day" className="relative space-y-4" style={{ color: INK }}>
      {day.is_demo && <DemoWatermarkOverlay />}
      {annotations.length > 0 && (
        <div className="space-y-1">
          {annotations.map((note) => (
            <p key={note} className="text-xs font-bold" style={{ color: RED }}>{note}</p>
          ))}
        </div>
      )}

      {/* Header fields — same list, same order as the printed page */}
      <dl className="flex flex-wrap gap-x-6 gap-y-2" data-testid="roadside-header-fields">
        {fields.map((f) => (
          <div key={f.label} className="min-w-[136px] flex-1 border-b pb-1" style={{ borderColor: RULE }}>
            <dt className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>{f.label}</dt>
            <dd className="text-sm font-semibold">{f.value || '—'}</dd>
          </div>
        ))}
      </dl>

      <NativeGrid drawable={drawable} totalsByLine={totalsByLine} />

      <section>
        <h3 className="text-xs font-bold">
          REMARKS (city/state of each change of duty status, shipping document numbers)
        </h3>
        <ul className="mt-1 space-y-0.5" data-testid="roadside-remarks">
          {remarks.length === 0 && <li className="text-xs" style={{ color: MUTED }}>None recorded.</li>}
          {remarks.map((line, i) => (
            <li key={`${line}-${i}`} className="text-xs">{line}</li>
          ))}
        </ul>
      </section>

      <section className="rounded border p-3" style={{ borderColor: RULE }} data-testid="roadside-recap">
        <h3 className="text-xs font-bold">RECAP — hours worked (entered by the driver)</h3>
        <dl className="mt-2 space-y-1">
          {recap.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-xs">{r.label}</dt>
              <dd className="min-w-[64px] border-b text-right text-xs font-bold" style={{ borderColor: RULE }}>
                {r.value || '—'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section data-testid="roadside-certification">
        <h3 className="text-xs font-bold">Driver&rsquo;s certification of these records</h3>
        <p className="mt-1 text-xs">I certify that these entries are true and correct.</p>
        {signatureDataUrl && (
          <img
            src={signatureDataUrl}
            alt="Driver signature"
            className="mt-2 h-12 object-contain"
          />
        )}
        <div className="mt-1 max-w-[280px] border-t pt-1 text-xs" style={{ borderColor: RULE }}>
          {day.certification_legal_name ?? driverName}
        </div>
        {rodsCertifiedAtLabel(day) && (
          <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
            {rodsCertifiedAtLabel(day)}
          </p>
        )}
      </section>

      <p className="text-[10px]" style={{ color: MUTED }} data-testid="roadside-citation">
        Record of duty status kept under 49 CFR 395.8 while the driver&rsquo;s ELD is
        malfunctioning, as permitted by 49 CFR 395.34.
      </p>
    </article>
  );
}

function NativeGrid({
  drawable,
  totalsByLine,
}: {
  drawable: RodsEvent[];
  totalsByLine: number[];
}) {
  // Shared with the PDF so the label column, grid origin and totals column all
  // land in the same place on both surfaces.
  const labelW = LABEL_GUTTER_W;
  const totalsW = 40;
  const topPad = 16;
  const width = labelW + GRID_W + totalsW;
  const height = topPad + GRID_H + 12;
  const hourW = hourWidth();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Duty status grid"
      data-testid="roadside-native-grid"
    >
      {Array.from({ length: 25 }, (_, h) => {
        const x = labelW + hourW * h;
        return (
          <g key={h}>
            <line
              x1={x} y1={topPad} x2={x} y2={topPad + GRID_H}
              stroke={isMajorHour(h) ? INK : MUTED}
              strokeWidth={isMajorHour(h) ? 0.9 : 0.4}
            />
            <text x={x} y={topPad - 5} fontSize={6} textAnchor="middle" fill={MUTED}>{hourLabel(h)}</text>
          </g>
        );
      })}

      {[0, 1, 2, 3, 4].map((i) => (
        <g key={`row-${i}`}>
          <line
            x1={labelW} y1={topPad + ROW_H * i} x2={labelW + GRID_W + totalsW} y2={topPad + ROW_H * i}
            stroke={INK} strokeWidth={0.6}
          />
          {i < 4 && (
            <>
              {/*
                Long labels wrap rather than shrink — a smaller font at the
                roadside is the wrong trade. Lines are stacked around the row
                centre so the duty line still sits on rowCenterOffset, and
                dominant-baseline replaces the old hand-tuned +2 nudge.
              */}
              <text
                x={0}
                y={topPad + rowCenterOffset((i + 1) as 1)}
                fontSize={7}
                fill={INK}
                dominantBaseline="middle"
                data-testid={`roadside-status-label-${i + 1}`}
              >
                {STATUS_LABEL_LINES[i].map((line, li) => (
                  <tspan
                    key={line}
                    x={0}
                    dy={li === 0
                      ? `${-0.5 * (STATUS_LABEL_LINES[i].length - 1)}em`
                      : '1em'}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
              <text
                x={labelW + GRID_W + 4}
                y={topPad + rowCenterOffset((i + 1) as 1)}
                fontSize={7}
                fontWeight="bold"
                fill={INK}
                dominantBaseline="middle"
                data-testid={`roadside-total-${i + 1}`}
              >
                {formatMinutes(totalsByLine[i])}
              </text>
            </>
          )}
        </g>
      ))}
      <line
        x1={labelW + GRID_W} y1={topPad} x2={labelW + GRID_W} y2={topPad + GRID_H}
        stroke={INK} strokeWidth={0.9}
      />

      {drawable.map((e, idx) => {
        const y = topPad + rowCenterOffset(e.duty_status as 1 | 2 | 3 | 4);
        const x1 = labelW + minuteToX(e.start_minute);
        const x2 = labelW + minuteToX(e.end_minute as number);
        const prev = drawable[idx - 1];
        // A vertical connector asserts "the status changed at this instant".
        // Never draw one across a gap.
        const contiguous = !!prev && prev.end_minute === e.start_minute;
        return (
          <g key={e.id}>
            {contiguous && (
              <line
                x1={x1} y1={topPad + rowCenterOffset(prev.duty_status as 1 | 2 | 3 | 4)} x2={x1} y2={y}
                stroke={INK} strokeWidth={1.6}
              />
            )}
            <line
              x1={x1} y1={y} x2={x2} y2={y}
              stroke={INK} strokeWidth={1.8} strokeLinecap="butt"
              data-testid={`roadside-segment-${e.id}`}
            />
          </g>
        );
      })}
    </svg>
  );
}