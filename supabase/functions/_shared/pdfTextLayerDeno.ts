// Server-side PDF text-layer extraction for the inbound email ingest path.
//
// The manual (browser) path extracts the layer with pdfjs-dist 5.7.284 via
// src/lib/pdfTextLayer.ts. This module uses the SAME pdfjs version so the two
// extractors read a document the same way, with two Deno accommodations that
// do not touch text extraction:
//   - minimal DOMMatrix / Path2D stubs, which the 5.x legacy build references
//     at module scope even though getTextContent never calls them;
//   - canvas stays unloaded (@napi-rs/canvas is rendering-only).
//
// The join semantics below mirror the browser extractor exactly: items joined
// with a single space, `hasEOL` emitting a newline, pages joined with '\n',
// and the same contiguous per-page line ranges — so region line indices and
// page numbers are comparable across both paths.

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
if (!g.DOMMatrix) g.DOMMatrix = class DOMMatrix {};
if (!g.Path2D) g.Path2D = class Path2D {};

export interface PageLineRange {
  /** 1-based page number, as printed and as rendered. */
  page: number;
  /** Inclusive line indices into `text`. */
  startLine: number;
  endLine: number;
}

export interface PdfTextLayerResult {
  text: string;
  pageCount: number;
  /** False when the PDF carries no extractable text (a scan, or an image). */
  available: boolean;
  pageLineRanges: PageLineRange[];
}

const EMPTY: PdfTextLayerResult = { text: '', pageCount: 0, available: false, pageLineRanges: [] };

/** The 1-based page a layer line falls on, or null when it cannot be placed. */
export function pageForLineDeno(
  layer: PdfTextLayerResult | null | undefined,
  line: number | null,
): number | null {
  if (!layer || line === null || line === undefined) return null;
  const hit = layer.pageLineRanges.find((r) => line >= r.startLine && line <= r.endLine);
  return hit ? hit.page : null;
}

export async function extractPdfTextLayerDeno(
  bytes: Uint8Array,
  opts: { maxPages?: number } = {},
): Promise<PdfTextLayerResult> {
  try {
    // The npm specifier itself lives in pdfjsDenoRuntime.ts as a static import
    // so Supabase Edge includes it in Deno's package constraint graph. This
    // dynamic local import still runs AFTER the DOM stubs above are installed.
    // deno-lint-ignore no-explicit-any
    const { pdfjs }: { pdfjs: any } = await import(/* @vite-ignore */ './pdfjsDenoRuntime.mjs');
    const pdf = await pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;
    const maxPages = Math.min(pdf.numPages, opts.maxPages ?? 20);

    const pages: string[] = [];
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = (content.items as { str?: string; hasEOL?: boolean }[])
        .map((it) => `${it.str ?? ''}${it.hasEOL ? '\n' : ''}`)
        .join(' ');
      pages.push(line);
    }

    const text = pages.join('\n');

    // Pages are joined with a newline, so each page owns a contiguous line range.
    let cursor = 0;
    const pageLineRanges: PageLineRange[] = pages.map((p, i) => {
      const lineCount = p.split('\n').length;
      const range = { page: i + 1, startLine: cursor, endLine: cursor + lineCount - 1 };
      cursor += lineCount;
      return range;
    });

    return { text, pageCount: pdf.numPages, available: text.trim().length > 0, pageLineRanges };
  } catch (err) {
    // A failed extraction is a missing arbiter, never a failed ingest — but on
    // this path it must be LOUD in the logs, because verbatim verification
    // silently degrading to no_layer on every field is the failure the user
    // explicitly refused.
    console.error('pdfTextLayerDeno: extraction failed —', err instanceof Error ? err.message : String(err));
    return EMPTY;
  }
}
