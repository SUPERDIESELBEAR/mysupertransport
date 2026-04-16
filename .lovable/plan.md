

## Fix: Print CSS Targeting Wrong DOM Level

### Problem
The print CSS rule `body > *:not(.app-print-root)` targets direct children of `<body>`, but the drawer lives inside `<div id="root">` — a child of body. This rule hides `#root` entirely, which hides the drawer content too. Result: blank print preview.

### Solution
Update the `@media print` block in `src/index.css` to:
1. Target `#root > *` instead of `body > *` so the selector reaches the correct DOM level
2. Alternatively, hide `#root`'s siblings (script tags, etc.) and then drill into `#root` to hide everything except the drawer

### Technical Details

| File | Change |
|------|--------|
| `src/index.css` (lines 191–215) | Fix the print CSS selectors to account for the `#root` wrapper div |

**Updated CSS approach:**
```css
@media print {
  /* Make root fill naturally */
  #root { overflow: visible !important; height: auto !important; }

  /* Hide everything inside #root except the drawer */
  #root > *:not(.app-print-root) { display: none !important; }

  /* Inside the print root, hide non-drawer elements */
  .app-print-root > *:not(.app-print-drawer) { display: none !important; }

  /* Unclip the drawer */
  .app-print-drawer {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .app-print-scroll {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
  }

  .app-print-hide { display: none !important; }
  @page { size: letter; margin: 0.5in; }
}
```

Single file change. No database changes needed.

