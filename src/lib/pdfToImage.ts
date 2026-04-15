/**
 * Renders the first page of a PDF to a PNG data URL using pdf.js.
 * Fetches the PDF as a blob first to handle CORS / signed URLs.
 */
export async function pdfToImage(pdfUrl: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  // Fetch as blob to bypass CORS issues with signed URLs
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at 2x scale for good quality
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/png');
}
