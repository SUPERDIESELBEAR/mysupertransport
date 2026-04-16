

## Digital 3-Ring Binder — Flipbook Mode for Operator Inspection Binder

### My Thoughts

**This is an excellent idea** and a natural fit for the existing Inspection Binder. The current binder is already organized like a real 3-ring binder (Cover Page → Company Documents → My Documents → My Uploads), but drivers interact with it as a list. A flipbook view adds a second, complementary mode that mirrors the physical experience an officer expects at roadside.

**Why it works for SUPERDRIVE specifically:**
- Drivers already think in "binder pages" (CDL, Med Cert, Insurance, IFTA…). A swipe-to-flip view matches their mental model.
- At a roadside stop, swiping is faster than tapping → preview → close → tap next. One thumb, one motion.
- We already have `useSwipeGesture` (used elsewhere in the app), `pdfToImage` for rendering PDFs to canvas, and signed URLs with year-long expiry — all the pieces exist.
- Email/text/QR sharing stays 100% intact — flipbook is an *additional* view mode, not a replacement.

**Recommended approach: "Page View" toggle, not a separate screen.** Add a view-mode switch at the top of the binder (`List` ↔ `Pages`). In Pages mode, each binder document becomes a full-screen "page" the driver swipes through, just like flipping a physical binder. The same Select / Email / Text / QR actions remain available from a top action bar.

**No true "page curl" animation** — those libraries (turn.js, StPageFlip) are heavy, jQuery-era, or don't play well with React + dynamic PDF content. A clean horizontal slide transition (like Instagram stories or a carousel) is faster, more reliable on mobile, and still feels like flipping a page. We can add a subtle page-turn shadow/curl effect with pure CSS for polish.

---

### What Gets Built

**1. New component: `BinderFlipbook.tsx`**
- Full-screen overlay (mobile) / large modal (desktop).
- Renders an ordered array of "pages" — one per document, in the same order as the existing binder (Cover → Company Docs → Driver Docs → Driver Uploads).
- Each page renders:
  - **PDFs** → first page rendered to canvas via existing `pdfToImage.ts` (with prev/next page controls inside multi-page PDFs).
  - **Images** (CDL front/back, etc.) → fitted `<img>`.
  - **Missing docs** → a clean placeholder page ("Not yet uploaded").
- Swipe left/right (touch) + arrow keys (desktop) + on-screen ◀ ▶ buttons.
- Top bar shows: doc name, page X of Y, Close (×), and a "⋯" menu with **Email this page / Text this page / Show QR / Email all / Select multiple**.
- Bottom strip: tiny thumbnail dots or scrollable mini-thumbnails to jump to any page.

**2. Toggle in `OperatorInspectionBinder.tsx`**
- Add a `List | Pages` segmented control near the existing "Select Documents" button.
- Default = `List` (preserves current behavior).
- `Pages` opens `BinderFlipbook`.

**3. Reuse, don't duplicate**
- Sharing logic (mailto / sms / public share token) → reuse the existing `bulkShareText` / `bulkShareEmail` functions.
- Page order → reuse `useBinderOrder` hook so the flipbook respects the admin-configured order.
- PDF rendering → reuse `src/lib/pdfToImage.ts`.
- Swipe → reuse `useSwipeGesture` (already battle-tested elsewhere).

**4. Polish (lightweight)**
- Subtle slide transition (200ms ease-out) between pages.
- Optional CSS page-curl shadow on the leading edge during swipe.
- Haptic tap (`navigator.vibrate(10)`) on page change (mobile only).
- Remember last-viewed page in `sessionStorage` so closing/reopening returns to the same place.

---

### What Stays Untouched
- The existing list view, upload flows, expiry editing, staff-side `OperatorBinderPanel`, and all sharing endpoints.
- Database schema — no changes needed.
- RLS / storage policies — no changes needed.

---

### Open Questions Before I Build

1. **Scope of flipbook pages** — Should "My Uploads" (roadside reports, repair receipts, miscellaneous) be included as flippable pages, or limit the flipbook to the formal Company + Driver docs only?
2. **Where the toggle lives** — Operator-only (mobile-first roadside use), or also surface "Pages" mode inside the staff-side `OperatorBinderPanel` so coordinators can preview what the driver sees?
3. **Multi-page PDFs** — When a single document is a 3-page PDF (e.g. Insurance), should each PDF page count as its own flipbook page, or stay as one document with internal prev/next?

I'll wait for your answers on these three before producing the build plan.

