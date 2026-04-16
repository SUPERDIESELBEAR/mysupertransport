

## Fix Application Print — Clone-to-Body Approach

### Root Cause

The CSS-only print approach (`#root > *:not(.app-print-root)`) fails because `.app-print-root` is not a direct child of `#root` — it's deeply nested inside React Router wrappers, providers, and layout components. The CSS selector never matches, so all parent containers with `overflow: hidden` and fixed heights remain active during print, clipping content to one page.

### Solution

Abandon the CSS-only approach. Instead, reuse the proven `printDocumentById` pattern already in `src/lib/printDocument.ts` — clone the scrollable content area to a top-level `<div>` appended directly to `<body>`, inject a `@media print` style that hides everything else, call `window.print()`, then clean up.

### Changes

| File | Change |
|------|--------|
| `src/components/management/ApplicationReviewDrawer.tsx` | 1. Add an `id` (e.g. `app-review-print-content`) to the scrollable content div. 2. Replace `handlePrint` to call `printDocumentById('app-review-print-content', fullName + ' — Application')`. 3. Remove the `app-print-root`, `app-print-drawer`, `app-print-scroll`, `app-print-hide` CSS classes — they're no longer needed. |
| `src/index.css` | Remove the entire `@media print` block (lines 190–221) since the clone-to-body approach handles print isolation via injected inline styles. |

### How it works

1. The scrollable `<div>` containing all application content gets an `id`
2. `printDocumentById` clones that element, appends it to `<body>`, injects a scoped print style that hides `body > *:not(#__print_clone_wrapper__)`, and calls `window.print()`
3. The clone is not trapped inside any fixed/overflow containers, so the browser paginates it naturally across multiple pages
4. After printing, the clone and style are removed — no DOM side effects

This is the same pattern already used successfully for standalone document printing elsewhere in the app.

