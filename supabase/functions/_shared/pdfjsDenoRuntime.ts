// Static npm import for Supabase Edge bundling.
// pdfTextLayerDeno imports this module dynamically AFTER installing the small
// DOM stubs pdfjs needs at module scope. Keeping the npm specifier here puts
// pdfjs-dist in Deno's package constraint graph without evaluating it before
// those stubs exist.

import * as pdfjs from 'npm:pdfjs-dist@5.7.284/legacy/build/pdf.min.mjs';

export { pdfjs };