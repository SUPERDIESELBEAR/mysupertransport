## Repairs & Maintenance — Mobile Layout + View Invoice Fix

Two changes to the driver-facing "My Truck" page (`src/components/fleet/FleetDetailDrawer.tsx`) and one targeted fix to the shared PDF preview (`src/components/inspection/DocRow.tsx`). No changes to the detail dialog that opens when a row is tapped — that stays exactly as it is.

### 1. Recommended layout: mobile-first cards (replaces the table on small screens)

The current view is a 5-column table crammed into ~731px of width. Shop names wrap vertically ("Love's / Travel / Stops & / Country / Stores, / Inc."), descriptions truncate at ~200px, and the category badge column disappears off-screen. Drivers can't see what a record actually is without tapping in.

Proposed card design (one card per record):

```text
┌──────────────────────────────────────────────┐
│ 7/12/26 · Tires                    $1,563.31 │  ← date · category chip, amount right
│ Love's Travel Stop #0360                     │  ← shop, single line, truncates w/ ellipsis
│ Roadside service for the replacement of      │  ← description, 2-line clamp
│ three blown or damaged trailer tires…        │
│                                              │
│ [ 👁 View invoice ]                          │  ← only shown if invoice exists
└──────────────────────────────────────────────┘
```

- Whole card is tappable → opens the existing Maintenance Record dialog (unchanged).
- Description gets 2 lines of room (`line-clamp-2`) instead of one truncated line.
- Category chip moves to the top row so it's always visible.
- Amount is right-aligned and prominent.
- "View invoice" button lives inside the card with `e.stopPropagation()` so it doesn't also open the detail.
- Search + category filter stay above the list, unchanged.
- On `sm:` and up, keep the current table (staff/desktop use). The card view applies to mobile only (`sm:hidden` for cards, `hidden sm:block` for the table).

### 2. Fix "View Invoice" broken link on mobile

Root cause (verified in `src/components/inspection/DocRow.tsx` line 701): the mobile PDF fallback card's **Open PDF** button calls `window.open(blobUrl, '_blank')`. iOS Safari blocks `blob:` URLs opened in a new tab — the tab opens black/empty, which is what the screenshot shows. The link isn't actually broken; the target scheme is unsupported.

Fix: open the signed https URL instead of the blob URL. iOS Safari renders PDFs from https URLs natively in a new tab.

```tsx
// before
onClick={() => window.open(blobUrl, '_blank')}
// after
onClick={() => window.open(resolvedUrl, '_blank', 'noopener,noreferrer')}
```

`resolvedUrl` is already computed in the same component and is the signed Supabase Storage URL. Share and Save buttons keep using the blob (they need the fetched bytes) — no change there.

This fix benefits every PDF preview app-wide (inspection certs, registrations, invoices), not just Repairs & Maintenance.

### Files touched

- `src/components/fleet/FleetDetailDrawer.tsx` — add mobile card list next to the existing table in the Repairs & Maintenance section (~lines 679–742). No data or state changes.
- `src/components/inspection/DocRow.tsx` — one-line change to the mobile PDF fallback "Open PDF" button (~line 701).

### Out of scope

- Comdata / MS Fleet resources, other sections of the page, staff drawer behavior, and the maintenance detail dialog remain untouched.
