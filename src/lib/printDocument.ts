/**
 * Scoped print utility — shows only the target element when printing.
 * Works with the browser's native "Save as PDF" / Print dialog.
 */
export function printDocumentById(elementId: string, documentTitle?: string) {
  const prevTitle = document.title;
  if (documentTitle) document.title = documentTitle;

  const el = document.getElementById(elementId);
  if (el) el.style.display = 'block';

  const style = document.createElement('style');
  style.id = '__print_scope_style__';
  style.innerHTML = `
    @media print {
      body * { visibility: hidden !important; }
      #${elementId}, #${elementId} * { visibility: visible !important; }
      #${elementId} { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; }
      @page { size: letter; margin: 0; }
    }
  `;
  document.head.appendChild(style);

  window.print();

  document.head.removeChild(style);
  if (el) el.style.display = 'none';
  document.title = prevTitle;
}

