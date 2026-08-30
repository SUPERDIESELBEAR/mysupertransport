import { supabase } from '@/integrations/supabase/client';

export interface GeneratedApplicationPdf {
  /** Object URL for the fetched blob. Caller owns revocation. */
  objectUrl: string;
  blob: Blob;
  filename: string;
}

/**
 * Single code path for producing the branded application PDF.
 *
 * Both the Submitted Application card and the preview modal use this so a
 * preview and a download can never come from different renders. The signed URL
 * is fetched to a blob first: handing a cross-origin signed URL straight to an
 * anchor opens a viewer tab instead of downloading.
 */
export async function generateApplicationPdf(
  applicationId: string,
  applicantName: string,
): Promise<GeneratedApplicationPdf> {
  const { data, error } = await supabase.functions.invoke('generate-application-pdf', {
    body: { application_id: applicationId },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? 'No document was returned');

  const res = await fetch(data.url);
  if (!res.ok) throw new Error('The generated document could not be retrieved');
  const blob = await res.blob();

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    filename:
      data.filename ??
      `Driver-Application_${(applicantName || 'Applicant').replace(/\s+/g, '-')}.pdf`,
  };
}

/** Triggers a browser download for an already-generated object URL. */
export function saveObjectUrl(objectUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
