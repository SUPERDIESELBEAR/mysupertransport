/**
 * Renders every page of a PDF to PNG data URLs using pdf.js.
 * Fetches the PDF as a blob first to handle CORS / signed URLs.
 * Used to display PDFs inline on mobile, where <iframe> PDF rendering
 * is unreliable (and handing off to a new tab is blocked inside the PWA).
 */
export async function pdfToImages(
  pdfUrl: string,
  opts?: { scale?: number; maxPages?: number },
): Promise<string[]> {
  if (!pdfUrl || /^https?:\/\//i.test(pdfUrl) === false) {
    throw new Error('Document source not accessible — please re-upload this document.');
  }

  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  return renderPdfBytesToImages(await response.arrayBuffer(), opts);
}

/**
 * Same renderer for a PDF already in memory (a picked File or raw bytes),
 * so an unsaved upload can be shown inline without a round trip.
 */
export async function pdfFileToImages(
  source: File | Blob | ArrayBuffer,
  opts?: { scale?: number; maxPages?: number },
): Promise<string[]> {
  const arrayBuffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  return renderPdfBytesToImages(arrayBuffer, opts);
}

async function renderPdfBytesToImages(
  arrayBuffer: ArrayBuffer,
  opts?: { scale?: number; maxPages?: number },
): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const scale = opts?.scale ?? 2;
  const maxPages = Math.min(pdf.numPages, opts?.maxPages ?? 30);

  const pages: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.85));
    canvas.width = 0;
    canvas.height = 0;
  }

  return pages;
}
