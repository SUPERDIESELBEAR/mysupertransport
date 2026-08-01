/**
 * Diagonal DEMO wash for on-screen roadside renders.
 *
 * Pure SVG with no dependencies — the roadside bundle forbids pdf-lib and
 * anything else heavy (see roadsideImportGraph.test.ts). Pointer events are
 * off so the officer can still scroll and tap the record underneath.
 *
 * Wrap the render in a `relative` container; this fills it.
 */
export const DEMO_WATERMARK_TEXT = 'DEMO — NOT A RECORD OF DUTY STATUS';

export default function DemoWatermarkOverlay() {
  return (
    <svg
      data-testid="demo-watermark"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id="demo-watermark-tile"
          width="420"
          height="180"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <text
            x="0"
            y="100"
            fontSize="22"
            fontWeight="700"
            fill="#d81f1f"
            fillOpacity="0.18"
            letterSpacing="1"
          >
            {DEMO_WATERMARK_TEXT}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#demo-watermark-tile)" />
    </svg>
  );
}
