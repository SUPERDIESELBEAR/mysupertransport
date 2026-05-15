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

/**
 * Cross-platform "Save as PDF" / Print flow that works reliably on
 * mobile browsers (iOS Safari, Android Chrome) where `window.print()`
 * applied to the current tab is unreliable — clones run before the
 * print preview captures the page, popups dismiss the dialog, etc.
 *
 * Strategy: open a brand-new window with ONLY the cloned element +
 * the parent document's stylesheets + inline styles, then trigger
 * `print()` from inside that window. The user can then choose
 * "Save as PDF" (desktop) or "Save to Files" / Print via the share
 * sheet (mobile). The window auto-closes after printing.
 *
 * Fallback: if popups are blocked (common on mobile), we render the
 * printable doc into the current tab as a top-level overlay with a
 * Print and Close button so the user can still trigger their
 * browser's save flow manually.
 */
export type PrintPageSize = 'letter' | 'a4';

export function openPrintableDocument(
  elementId: string,
  documentTitle = 'Document',
  pageSize: PrintPageSize = 'letter',
) {
  const el = document.getElementById(elementId);
  if (!el) return;

  // Collect everything in <head> that affects rendering: <style>,
  // <link rel="stylesheet">, and font preconnects. Tailwind utility
  // classes used in the cloned element only resolve if the
  // stylesheet is present.
  const headHtml = Array.from(
    document.head.querySelectorAll(
      'style, link[rel="stylesheet"], link[rel="preconnect"], link[as="font"], link[rel="preload"][as="style"]',
    ),
  )
    .map((node) => node.outerHTML)
    .join('\n');

  const bodyHtml = el.outerHTML;

  const safeTitle = documentTitle.replace(/[<>]/g, '');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
${headHtml}
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Force the cloned root visible even if the source had display:none */
  #${elementId} { display: block !important; margin: 0 auto; }
  /* Adapt the on-screen preview to the chosen paper size so the user
     sees roughly what will print. Inline styles inside the doc set the
     letter-sized 8.5in width; for A4 we override the visible width. */
  ${pageSize === 'a4' ? `#${elementId} > div { max-width: 210mm !important; min-height: 297mm !important; padding: 20mm !important; }` : ''}
  /* Floating action bar for the on-screen state (hidden when printing) */
  .__print_actions {
    position: fixed; top: 0; left: 0; right: 0;
    display: flex; gap: 8px; justify-content: center;
    padding: 10px; background: #0F0F0F; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
    font-size: 14px; z-index: 999999;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .__print_actions button {
    appearance: none; border: 0; cursor: pointer;
    background: #C9A84C; color: #0F0F0F; font-weight: 700;
    padding: 8px 16px; border-radius: 6px; font-size: 14px;
  }
  .__print_actions button.secondary { background: transparent; color: #fff; border: 1px solid #555; }
  .__print_spacer { height: 56px; }
  @media print {
    .__print_actions, .__print_spacer { display: none !important; }
    @page { size: ${pageSize === 'a4' ? 'A4' : 'letter'}; margin: 0; }
  }
</style>
</head>
<body>
  <div class="__print_actions">
    <button onclick="window.print()">Save as PDF / Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="__print_spacer"></div>
  ${bodyHtml}
  <script>
    (function () {
      // Wait for fonts + images so the print preview captures them.
      function ready() {
        var imgs = Array.prototype.slice.call(document.images);
        return Promise.all(
          imgs.map(function (img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function (res) {
              img.addEventListener('load', res, { once: true });
              img.addEventListener('error', res, { once: true });
            });
          })
        ).then(function () {
          if (document.fonts && document.fonts.ready) return document.fonts.ready;
        });
      }
      window.addEventListener('load', function () {
        ready().then(function () {
          // Slight delay lets layout settle on iOS Safari.
          setTimeout(function () { try { window.print(); } catch (_) {} }, 250);
        });
      });
      window.addEventListener('afterprint', function () {
        // Don't auto-close on iOS — user often wants to save again
        // from the share sheet. Desktop users can hit Close manually.
      });
    })();
  </script>
</body>
</html>`;

  // Try to open a real new window first (best UX on desktop and Android).
  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  // Popup blocked (common on mobile Safari). Fall back to a same-tab
  // overlay: navigate to a Blob URL in a sandboxed iframe so the
  // user's app state is preserved underneath.
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const overlay = document.createElement('div');
  overlay.id = '__print_fallback_overlay__';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:#0F0F0F',
  ].join(';');
  overlay.innerHTML = `
    <div style="position:absolute;top:0;left:0;right:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#0F0F0F;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.25)">
      <span style="align-self:center;opacity:.85">Use your browser's share menu to save as PDF</span>
      <button id="__print_close_btn__" style="appearance:none;border:1px solid #555;background:transparent;color:#fff;cursor:pointer;padding:8px 16px;border-radius:6px;font-size:14px;font-weight:700">Close</button>
    </div>
    <iframe src="${url}" style="position:absolute;inset:0;top:48px;width:100%;height:calc(100% - 48px);border:0;background:#fff"></iframe>
  `;
  document.body.appendChild(overlay);
  document
    .getElementById('__print_close_btn__')
    ?.addEventListener('click', () => {
      URL.revokeObjectURL(url);
      overlay.remove();
    });
}
