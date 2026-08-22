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

export interface PdfTextLayer {
  text: string;
  pageCount: number;
  /** False when the PDF carries no extractable text (a scan, or an image upload). */
  available: boolean;
}

const EMPTY: PdfTextLayer = { text: '', pageCount: 0, available: false };

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
    return { text, pageCount: pdf.numPages, available: text.trim().length > 0 };
  } catch {
    // A failed extraction is a missing arbiter, never a failed parse.
    return EMPTY;
  }
}

/** Non-PDF uploads (phone photos of a tender) have no layer to check against. */
export const textLayerFor = async (file: File): Promise<PdfTextLayer> =>
  file.type === 'application/pdf' ? extractPdfTextLayer(file) : EMPTY;
