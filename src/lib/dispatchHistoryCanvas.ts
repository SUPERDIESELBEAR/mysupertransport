/**
 * Canvas renderer for the dispatch-history screenshot export.
 *
 * We used to rasterize an off-screen DOM node with html-to-image, but that path
 * serializes the whole document's stylesheets into an SVG <foreignObject>; a
 * single unsupported rule or cross-origin font makes the SVG image fail to
 * decode and the export silently comes back as a blank white PNG. Drawing the
 * report straight onto a 2D canvas has no such failure mode.
 */

export type DailyStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

export const STATUS_META: Record<DailyStatus, { label: string; bg: string; text: string; short: string }> = {
  dispatched:     { label: 'Dispatched',     bg: '#DCFCE7', text: '#166534', short: 'D' },
  home:           { label: 'Home',           bg: '#FEF3C7', text: '#92400E', short: 'H' },
  truck_down:     { label: 'Truck Down',     bg: '#FEE2E2', text: '#991B1B', short: 'T' },
  not_dispatched: { label: 'Not Dispatched', bg: '#E5E7EB', text: '#374151', short: 'N' },
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface HistoryPngInput {
  fullName: string;
  unitNumber: string | null;
  fromLabel: string;
  toLabel: string;
  generatedAt: string;
  /** ISO dates in order, with their short display label. */
  days: { iso: string; label: string; status: DailyStatus | null }[];
}

/** Renders the dispatch history report and returns a PNG data URL. */
export function renderDispatchHistoryPng(input: HistoryPngInput, scale = 2): string {
  const W = 1100;
  const PAD = 32;
  const CELL_W = 62;
  const CELL_H = 46;
  const GAP = 6;
  const cols = Math.floor((W - PAD * 2 + GAP) / (CELL_W + GAP));
  const rows = Math.ceil(input.days.length / cols);

  const counts = { dispatched: 0, home: 0, truck_down: 0, not_dispatched: 0, unlogged: 0 };
  for (const d of input.days) {
    if (d.status) counts[d.status]++;
    else counts.unlogged++;
  }

  const headerH = 96;
  const legendH = 34;
  const cardHeaderH = 56;
  const gridTop = PAD + headerH + legendH + cardHeaderH;
  const H = gridTop + rows * (CELL_H + GAP) + PAD + 8;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#0F0F0F';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`Dispatch History — ${input.fullName}`, PAD, PAD + 22);

  ctx.fillStyle = '#555555';
  ctx.font = `13px ${FONT}`;
  const dayWord = input.days.length !== 1 ? 'days' : 'day';
  ctx.fillText(
    `${input.fromLabel} — ${input.toLabel} · ${input.days.length} ${dayWord} · Generated ${input.generatedAt}`,
    PAD,
    PAD + 46,
  );

  // Rule under the header
  ctx.fillStyle = '#0F0F0F';
  ctx.fillRect(PAD, PAD + 60, W - PAD * 2, 2);

  // Legend
  let lx = PAD;
  const ly = PAD + 82;
  const legendItems: { bg: string; text: string; short: string; label: string }[] = [
    ...(Object.keys(STATUS_META) as DailyStatus[]).map(s => STATUS_META[s]),
    { bg: '#F4F4F5', text: '#A1A1AA', short: '—', label: 'No entry' },
  ];
  for (const item of legendItems) {
    ctx.fillStyle = item.bg;
    roundRect(ctx, lx, ly - 13, 20, 20, 4);
    ctx.fill();
    ctx.fillStyle = item.text;
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(item.short, lx + 10, ly + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#444444';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(item.label, lx + 26, ly + 1);
    lx += 26 + ctx.measureText(item.label).width + 18;
  }

  // Card
  const cardX = PAD;
  const cardY = PAD + headerH + legendH - 8;
  const cardH = H - cardY - PAD + 8;
  ctx.strokeStyle = '#D4D4D8';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, W - PAD * 2, cardH, 8);
  ctx.stroke();

  // Card header: driver + counts
  ctx.fillStyle = '#0F0F0F';
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(input.fullName, cardX + 14, cardY + 26);
  if (input.unitNumber) {
    ctx.fillStyle = '#666666';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`Unit ${input.unitNumber}`, cardX + 14, cardY + 44);
  }

  const summary: { text: string; color: string }[] = [
    { text: `${counts.dispatched} D`, color: STATUS_META.dispatched.text },
    { text: `${counts.home} H`, color: STATUS_META.home.text },
    { text: `${counts.truck_down} T`, color: STATUS_META.truck_down.text },
    { text: `${counts.not_dispatched} N`, color: STATUS_META.not_dispatched.text },
  ];
  if (counts.unlogged > 0) summary.push({ text: `${counts.unlogged} —`, color: '#71717A' });

  ctx.font = `700 12px ${FONT}`;
  const chipW = summary.map(s => ctx.measureText(s.text).width + 14);
  let sx = W - PAD - 14 - chipW.reduce((a, b) => a + b + 6, -6);
  summary.forEach((s, i) => {
    ctx.fillStyle = '#F4F4F5';
    roundRect(ctx, sx, cardY + 12, chipW[i], 20, 4);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.textAlign = 'center';
    ctx.fillText(s.text, sx + chipW[i] / 2, cardY + 26);
    ctx.textAlign = 'left';
    sx += chipW[i] + 6;
  });

  // Day cells
  input.days.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL_W + GAP);
    const y = gridTop + row * (CELL_H + GAP);

    ctx.fillStyle = '#FAFAFA';
    roundRect(ctx, x, y, CELL_W, CELL_H, 4);
    ctx.fill();

    ctx.fillStyle = '#52525B';
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + CELL_W / 2, y + 14);

    const meta = d.status
      ? STATUS_META[d.status]
      : { bg: '#F4F4F5', text: '#A1A1AA', short: '—' };
    ctx.fillStyle = meta.bg;
    roundRect(ctx, x + CELL_W / 2 - 11, y + 20, 22, 20, 4);
    ctx.fill();
    ctx.fillStyle = meta.text;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(meta.short, x + CELL_W / 2, y + 34);
    ctx.textAlign = 'left';
  });

  return canvas.toDataURL('image/png');
}
