import { supabase } from '@/integrations/supabase/client';

/**
 * Pre-fetch a private storage URL and convert it to a base64 data URL
 * so it renders reliably in browser print / Save-as-PDF.
 */
export async function preloadSignatureDataUrl(
  rawUrl: string | null,
  bucket = 'signatures'
): Promise<string | null> {
  if (!rawUrl) return null;
  try {
    // Extract storage path from the URL
    const path = extractPath(rawUrl, bucket);
    if (!path) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (!data?.signedUrl) return null;

    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function extractPath(url: string, bucket: string): string | null {
  if (!url.startsWith('http')) return url;
  for (const marker of [
    `/object/public/${bucket}/`,
    `/storage/v1/object/public/${bucket}/`,
  ]) {
    const idx = url.indexOf(marker);
    if (idx !== -1) return url.slice(idx + marker.length);
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Scoped print utility — shows only the target element when printing.
 * Works with the browser's native "Save as PDF" / Print dialog.
 */
export function printDocumentById(elementId: string, documentTitle?: string) {
  const prevTitle = document.title;
  if (documentTitle) document.title = documentTitle;

  const el = document.getElementById(elementId);
  if (!el) {
    document.title = prevTitle;
    return;
  }

  // Clone the element into a top-level wrapper so it's not trapped
  // inside a fixed/off-screen parent container.
  const wrapper = document.createElement('div');
  wrapper.id = '__print_clone_wrapper__';
  wrapper.appendChild(el.cloneNode(true));
  // Make the clone's root visible (original may be display:none)
  const cloneRoot = wrapper.firstElementChild as HTMLElement;
  if (cloneRoot) cloneRoot.style.display = 'block';
  document.body.appendChild(wrapper);

  const style = document.createElement('style');
  style.id = '__print_scope_style__';
  style.innerHTML = `
    @media print {
      body > *:not(#__print_clone_wrapper__) { display: none !important; }
      #__print_clone_wrapper__ {
        display: block !important;
        position: static !important;
        width: 100% !important;
      }
      #__print_clone_wrapper__ * { visibility: visible !important; }
      @page { size: letter; margin: 0; }
    }
  `;
  document.head.appendChild(style);

  window.print();

  document.head.removeChild(style);
  document.body.removeChild(wrapper);
  document.title = prevTitle;
}
