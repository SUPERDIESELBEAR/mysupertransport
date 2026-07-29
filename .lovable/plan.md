## Problem

In the driver binder flipbook, the three-dot menu shows the top three actions — **Email this page**, **Text this page**, **Show QR code** — greyed out on any page whose source doesn't have a public share token. That is:

- The **Cover Page** (page 1) — it's a synthetic page, not a document, so `shareToken` is `null`.
- Any **driver upload** page — those pages are wired with `shareToken: null` in `OperatorInspectionBinder.tsx`, `OperatorBinderPanel.tsx`, and `InspectionBinderAdmin.tsx`.

That's why the items appear "broken/not bold" — `DropdownMenuItem` renders them disabled when `!current?.shareToken`.

## Fix

Make the three actions functional on every page instead of hiding them behind a share token gate.

### 1. Cover Page → act on the whole binder

On the cover, the top three items map to binder-wide equivalents (all documents that DO have a share token):

- **Email this page** → same body as "Email all docs" (list of `title: link` for every shareable page), subject `"{Driver} — Digital Inspection Binder"`.
- **Text this page** → same list via `sms:?body=`.
- **Show QR code** → QR encodes a `data:text/plain` payload with the driver name + all links, so a scan reveals the full binder list. (Fallback: if only one shareable doc exists, encode that doc's `/inspect/{token}` URL directly for a cleaner scan.)

### 2. Driver-upload pages → share the file directly

Driver uploads live in the `driver-uploads` bucket and don't get a `/inspect/{token}` route, but they already expose a `fileUrl` (signed URL). Use that:

- **Email this page** → `mailto:` with `"{title}: {fileUrl}"`.
- **Text this page** → `sms:` with the same body.
- **Show QR code** → QR encodes `fileUrl`.

Because signed URLs expire, add a short note in the QR modal ("Link expires in ~1 hour — rescan if needed") only when the page is an upload.

### 3. Document pages (unchanged behavior, just visual polish)

Docs with a `shareToken` keep the existing `/inspect/{token}` behavior. No functional change — they were already working, but they will now render as active (not greyed) alongside the other pages, matching the user's expectation that all three items are always live.

## Files to change

- `src/components/inspection/BinderFlipbook.tsx`
  - Remove the `disabled={!current?.shareToken}` guards on the top three menu items.
  - Update `shareCurrentEmail`, `shareCurrentText`, and the QR source to branch by page kind:
    - `kind === 'cover'` → binder-wide list (reuses existing `shareAllEmail` body builder).
    - `kind === 'upload'` (or any page without `shareToken` but with `fileUrl`) → use `fileUrl`.
    - Otherwise → existing `/inspect/{token}` behavior.
  - Update `qrSrc` to compute from the same branching logic.

No changes to callers (`OperatorInspectionBinder.tsx`, `OperatorBinderPanel.tsx`, `InspectionBinderAdmin.tsx`) — page data already carries `kind`, `fileUrl`, and `shareToken`.

## Verification

- Open the binder on Cover Page → three top items are active; Email/Text opens composer with all doc links; QR renders a scannable payload.
- Navigate to a document page → behavior identical to today (per-doc share link / QR).
- Navigate to a driver upload → items are active; Email/Text/QR use the signed `fileUrl`.
