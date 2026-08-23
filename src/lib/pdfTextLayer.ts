/**
 * Reads a PDF's embedded text layer in the browser.
 *
 * This is the arbiter for verbatim capture: what the page actually prints,
 * independent of what the model says it printed. It is best-effort by design —
 * a scanned tender has no text layer at all, and a generated one can render
 * glyph runs as control characters. Both cases are reported rather than thrown,
 * and `verifyVerbatim` distinguishes "no layer" and "layer unreliable" from
 * "the transcription is wrong".
 */

export interface PageLineRange {
  /** 1-based page number, as printed and as rendered. */
  page: number;
  /** Inclusive line indices into `text`. */
  startLine: number;
  endLine: number;
}

export interface PdfTextLayer {
  text: string;
  pageCount: number;
  /** False when the PDF carries no extractable text (a scan, or an image upload). */
  available: boolean;
  /**
   * Which lines of `text` came from which page. A resolved field region is a
   * line range, so this is what turns it into a page the dispatcher can be
   * shown while repairing a damaged capture.
   */
  pageLineRanges: PageLineRange[];
}

const EMPTY: PdfTextLayer = { text: '', pageCount: 0, available: false, pageLineRanges: [] };

/** The 1-based page a layer line falls on, or null when it cannot be placed. */
export function pageForLine(layer: PdfTextLayer | null | undefined, line: number | null): number | null {
  if (!layer || line === null || line === undefined) return null;
  const hit = layer.pageLineRanges.find(r => line >= r.startLine && line <= r.endLine);
  return hit ? hit.page : null;
}


export async function extractPdfTextLayer(
  source: File | Blob | ArrayBuffer,
  opts: { maxPages?: number } = {},
): Promise<PdfTextLayer> {
  try {
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();

    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const maxPages = Math.min(pdf.numPages, opts.maxPages ?? 20);

    const pages: string[] = [];
    for (let i = 1; i <= maxPages; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdf.getPage(i);
      // eslint-disable-next-line no-await-in-loop
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

  } catch {
    // A failed extraction is a missing arbiter, never a failed parse.
    return EMPTY;
  }
}

/** Non-PDF uploads (phone photos of a tender) have no layer to check against. */
export const textLayerFor = async (file: File): Promise<PdfTextLayer> =>
  file.type === 'application/pdf' ? extractPdfTextLayer(file) : EMPTY;
