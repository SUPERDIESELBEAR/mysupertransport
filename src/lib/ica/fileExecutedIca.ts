import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

/**
 * Renders the on-screen executed ICA to a paginated PDF and hands it to the
 * `file-executed-ica` edge function, which files it into the DRIVER's DOT
 * inspection binder under "Lease Agreement (ICA)".
 *
 * Best-effort: never throws into the signing flow — the signature itself is
 * already saved by the time this runs.
 */
export async function fileExecutedIca(params: {
  elementId: string;
  operatorId: string;
  contractId: string;
}): Promise<{ filed: boolean; reason?: string }> {
  const { elementId, operatorId, contractId } = params;
  try {
    const el = document.getElementById(elementId);
    if (!el) return { filed: false, reason: 'document element not found' };

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

    let remaining = imgHeight;
    let offset = 0;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    while (remaining > 0) {
      pdf.addImage(imgData, 'JPEG', 0, -offset, imgWidth, imgHeight, undefined, 'FAST');
      remaining -= pageHeight;
      offset += pageHeight;
      if (remaining > 0) pdf.addPage();
    }

    const base64 = pdf.output('datauristring').split(',').pop() ?? '';
    if (!base64) return { filed: false, reason: 'empty pdf' };

    const { error } = await supabase.functions.invoke('file-executed-ica', {
      body: { operator_id: operatorId, contract_id: contractId, pdf_base64: base64 },
    });
    if (error) return { filed: false, reason: error.message };
    return { filed: true };
  } catch (err) {
    return { filed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}