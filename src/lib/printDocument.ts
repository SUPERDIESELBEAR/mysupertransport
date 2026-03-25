/**
 * Scoped print utility — shows only the target element when printing.
 * Works with the browser's native "Save as PDF" / Print dialog.
 */
export function printDocumentById(elementId: string, documentTitle?: string) {
  const prevTitle = document.title;
  if (documentTitle) document.title = documentTitle;

  const style = document.createElement('style');
  style.id = '__print_scope_style__';
  style.innerHTML = `
    @media print {
      body > * { display: none !important; }
      #${elementId} { display: block !important; }
      #${elementId} * { visibility: visible !important; }
    }
  `;
  document.head.appendChild(style);

  window.print();

  document.head.removeChild(style);
  document.title = prevTitle;
}
