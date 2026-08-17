/**
 * Diagonal "REVIEW COPY" watermark overlay.
 *
 * Rendered as repeated rotated text nodes (not a CSS background image) so it
 * reliably rasterizes through html2canvas when the document is exported to PDF.
 */
export default function IcaWatermark({ text = 'REVIEW COPY — NOT FOR SIGNATURE' }: { text?: string }) {
  const rows = Array.from({ length: 14 });
  const cols = Array.from({ length: 3 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none"
    >
      {rows.map((_, r) => (
        <div
          key={r}
          className="absolute left-0 right-0 flex justify-around"
          style={{ top: `${r * 260}px` }}
        >
          {cols.map((__, c) => (
            <span
              key={c}
              style={{
                transform: 'rotate(-32deg)',
                color: 'rgba(201, 168, 76, 0.16)',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                whiteSpace: 'nowrap',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}