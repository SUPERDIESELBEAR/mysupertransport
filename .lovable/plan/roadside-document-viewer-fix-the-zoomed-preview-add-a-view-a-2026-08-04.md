# Roadside document viewer: fix the zoomed preview + add a "View all" flipbook

## 1. Fix the zoomed-in preview on desktop

Today the viewer always embeds the file in an `<iframe>`. That is correct for PDFs, but an image (CDL photo, med card photo) inside an iframe renders at native pixel size, so it looks cropped and zoomed.

Recommendation: keep both the preview and the Open button — the preview is what makes the page useful to an officer on a laptop, and Open/Save is the reliable path on phones. Fix the preview instead of deleting anything:

- Detect the file type from the URL.
- Images render as an `<img>` fitted to the card (whole document visible, no crop), click to open full size.
- PDFs keep the current iframe embed.
- Mobile behavior is unchanged: no inline preview, Open goes straight to the file.

## 2. "View all documents" flipbook for recipients

Add a bundle link so a recipient can page through every shared document in one screen, while the existing per-document links keep working.

- When a binder email goes out with more than one document, the server also creates a **bundle** record holding that exact set of document tokens, the driver name/unit, and the same expiry rules as the individual links.
- The email gains a prominent gold **View all documents** button above the numbered list. Each row keeps its own View button.
- The bundle link opens a full-screen viewer: one document at a time with Previous / Next, a page counter ("3 of 7"), document title and validity badge, a name strip to jump directly to any document, and Open / Save for the document on screen. Swipe works on phones.
- Access is read-only and anonymous, same as today's single-document links, and every open is logged the same way.

## Technical notes

- `src/pages/InspectionSharePage.tsx`: add an `isImageFile` branch; `<img className="max-h-full w-full object-contain">` for images, existing iframe for PDFs.
- New table `public.binder_share_bundles` (id, token uuid unique, created_by, driver_name, unit_number, doc_tokens uuid[], created_at, expires_at) with RLS + GRANTs; anon gets no direct select.
- New SECURITY DEFINER RPC `resolve_share_bundle(p_token uuid)` returning the resolvable documents for the bundle, delegating per token to the same logic as `resolve_share_token` (revoked/expired filtering, access logging, throttling), granted to `anon, authenticated, service_role`.
- `supabase/functions/send-binder-share/index.ts`: after authorizing the items, insert a bundle row and shorten its URL the same way per-doc links are shortened; pass `bundleUrl` into the email input.
- `supabase/functions/_shared/binder-share-email.ts` + `src/lib/binderShareFormat.ts`: render the "View all documents" CTA and a matching plain-text line when a bundle URL is present.
- New route `/inspect/all/:token` → `src/pages/BinderShareBundlePage.tsx`, reusing the existing header/branding, expiry badge and Open/Save block; navigation via `useSwipeGesture`.