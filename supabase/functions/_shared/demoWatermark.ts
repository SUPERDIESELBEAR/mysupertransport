/**
 * Diagonal DEMO watermark for every generated artifact belonging to a demo
 * operator.
 *
 * Isomorphic on purpose: no imports at all. pdf-lib pieces are injected by the
 * caller so this exact file runs in the browser (`import { rgb } from 'pdf-lib'`)
 * and in Deno (`npm:pdf-lib@1.17.1`), matching malfunctionNoticeCore.
 *
 * Wording is fixed. An officer handed a demo-generated §395.8 log at a training
 * session has no other way to tell it apart from a real one, so the mark has to
 * be unmissable and it has to say what the document is not.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const DEMO_WATERMARK_TEXT = 'DEMO — NOT A RECORD OF DUTY STATUS';

/** ~45° across the page, matching the SVG render. */
export const DEMO_WATERMARK_ANGLE_DEG = 45;

/**
 * Draws the mark across `page`. Call this LAST for a page so the mark crosses
 * the grid, the remarks and the signature rather than sitting under them.
 */
export function drawDemoWatermark(
  page: any,
  font: any,
  rgb: (r: number, g: number, b: number) => any,
  degrees: (d: number) => any,
): void {
  const { width, height } = page.getSize();
  const size = Math.max(18, Math.min(width, height) * 0.045);
  const color = rgb(0.85, 0.12, 0.12);
  const opacity = 0.18;

  // Repeated bands so the mark cannot be cropped off or mistaken for a stamp
  // in one corner.
  const bandGap = Math.max(120, height / 4);
  const diagonal = Math.sqrt(width * width + height * height);

  for (let offset = -height; offset < height * 2; offset += bandGap) {
    page.drawText(DEMO_WATERMARK_TEXT, {
      x: -width * 0.1,
      y: offset,
      size,
      font,
      color,
      opacity,
      rotate: degrees(DEMO_WATERMARK_ANGLE_DEG),
      maxWidth: diagonal * 1.2,
    });
  }
}
