/**
 * Print an image by URL. Opens a popup window with just the image and
 * triggers print() once it loads. Falls back to a hidden iframe in the
 * current document when popups are blocked (common on mobile Safari).
 */
export function printImageUrl(url: string, title = 'Image'): void {
  const safeTitle = title.replace(/[<>]/g, '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  html,body{margin:0;padding:0;background:#fff;height:100%}
  body{display:flex;align-items:center;justify-content:center}
  img{max-width:100%;max-height:100vh;object-fit:contain}
  @media print{@page{size:auto;margin:0.4in}body{height:auto}img{max-height:none;width:100%}}
</style></head><body>
<img id="p" src="${url}" alt="${safeTitle}" />
<script>
  (function(){
    var img=document.getElementById('p');
    function go(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},150);} 
    if(img.complete)go();else{img.addEventListener('load',go,{once:true});img.addEventListener('error',go,{once:true});}
  })();
</script></body></html>`;

  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  // Fallback: hidden iframe in the current document.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const cleanup = () => {
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* noop */ }
    }, 1000);
  };
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch { /* noop */ }
    cleanup();
  };
  iframe.srcdoc = html;
}