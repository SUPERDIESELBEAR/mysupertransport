import { useMemo } from 'react';
import {
  GRID_H, GRID_W, ROW_H, STATUS_SHORT,
  hourLabel, hourWidth, isMajorHour, minuteToX, rowCenterOffset,
} from '@/lib/eld/rodsGridGeometry';
import { findGaps } from '@/lib/eld/rodsValidation';
import type { DraftSegment } from '@/hooks/useRodsDay';

/**
 * Live 49 CFR 395.8(g) grid. Geometry is shared with the PDF renderers so what
 * the driver sees here is what prints.
 */
export default function RodsGrid({
  segments,
  activeLocalId,
  showGaps,
}: {
  segments: DraftSegment[];
  activeLocalId?: string | null;
  /** Hatch uncovered stretches. Only meaningful once every entry is finished. */
  showGaps?: boolean;
}) {
  const labelW = 62;
  const topPad = 14;
  const width = labelW + GRID_W + 8;
  const height = topPad + GRID_H + 14;
  const hourW = hourWidth();

  const sorted = useMemo(
    () => [...segments].sort((a, b) => a.start_minute - b.start_minute),
    [segments],
  );
  /** Only segments the driver has actually finished can be drawn. */
  const drawable = useMemo(
    () => sorted.filter((s) => s.end_minute !== null && s.duty_status !== null),
    [sorted],
  );
  const gaps = useMemo(() => (showGaps ? findGaps(sorted) : []), [showGaps, sorted]);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-background p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Duty status grid">
        <defs>
          <pattern id="rods-gap" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="hsl(var(--destructive) / 0.08)" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="hsl(var(--destructive) / 0.55)" strokeWidth={1.2} />
          </pattern>
        </defs>

        {/* uncovered stretches — surfaced, never filled in */}
        {gaps.map((g) => (
          <rect
            key={`gap-${g.start_minute}`}
            x={labelW + minuteToX(g.start_minute)}
            y={topPad}
            width={Math.max(1, minuteToX(g.end_minute) - minuteToX(g.start_minute))}
            height={GRID_H}
            fill="url(#rods-gap)"
          />
        ))}

        {/* hour ticks */}
        {Array.from({ length: 25 }, (_, h) => {
          const x = labelW + hourW * h;
          return (
            <g key={h}>
              <line
                x1={x} y1={topPad} x2={x} y2={topPad + GRID_H}
                stroke={isMajorHour(h) ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}
                strokeWidth={isMajorHour(h) ? 0.9 : 0.4}
              />
              <text x={x} y={topPad - 4} fontSize={6} textAnchor="middle" fill="hsl(var(--muted-foreground))">
                {hourLabel(h)}
              </text>
            </g>
          );
        })}

        {/* status rows */}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={`row-${i}`}>
            <line
              x1={labelW} y1={topPad + ROW_H * i} x2={labelW + GRID_W} y2={topPad + ROW_H * i}
              stroke="hsl(var(--foreground))" strokeWidth={0.6}
            />
            {i < 4 && (
              <text x={0} y={topPad + rowCenterOffset((i + 1) as 1) + 2} fontSize={7} fill="hsl(var(--foreground))">
                {i + 1}. {STATUS_SHORT[i]}
              </text>
            )}
          </g>
        ))}

        {/* duty line */}
        {drawable.map((s, idx) => {
          const y = topPad + rowCenterOffset(s.duty_status as 1 | 2 | 3 | 4);
          const x1 = labelW + minuteToX(s.start_minute);
          const x2 = labelW + minuteToX(s.end_minute as number);
          const prev = drawable[idx - 1];
          const active = activeLocalId === s.localId;
          // A vertical connector means "the status changed at this instant".
          // Drawing one across a gap would assert continuity that isn't there.
          const contiguous = !!prev && prev.end_minute === s.start_minute;
          return (
            <g key={s.localId}>
              {contiguous && (
                <line
                  x1={x1} y1={topPad + rowCenterOffset(prev.duty_status as 1 | 2 | 3 | 4)} x2={x1} y2={y}
                  stroke="hsl(var(--foreground))" strokeWidth={1.6}
                />
              )}
              <line
                x1={x1} y1={y} x2={x2} y2={y}
                stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
                strokeWidth={active ? 3 : 1.8}
                strokeLinecap="butt"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}