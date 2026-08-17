import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Rasterizes an on-screen ICA element into a paginated letter-size PDF.
 * Shared by the executed-ICA filing flow and the watermarked review copy.
 */
export async function buildIcaPdf(el: HTMLElement): Promise<jsPDF> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  let remaining = imgHeight;
  let offset = 0;
  while (remaining > 0) {
    pdf.addImage(imgData, 'JPEG', 0, -offset, imgWidth, imgHeight, undefined, 'FAST');
    remaining -= pageHeight;
    offset += pageHeight;
    if (remaining > 0) pdf.addPage();
  }
  return pdf;
}

/** Builds the PDF from an element and triggers a browser download. */
export async function downloadIcaPdf(el: HTMLElement, filename: string): Promise<void> {
  const pdf = await buildIcaPdf(el);
  pdf.save(filename);
}