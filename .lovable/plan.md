## Problem

The MS Fleet Fuel Card Instructions resources have two issues on mobile:

1. **Layout runs together.** The body content is stored as raw markdown (`**bold**`, no paragraph breaks), but the viewer renders it as HTML via `sanitizeRichHtml`. Result: the asterisks show literally and everything collapses into one giant block of text.
2. **Reference content behaves like a checklist item.** The Step-by-Step guide is flagged `is_start_here = true`, so it appears in the "Getting Started Checklist". Once a driver taps "Mark Complete" (or the FAQ), both items render with a line-through and show as "completed" — implying they only need to be read once. The user wants these to be always-available reference material with no completion tracking.

## Plan

### 1. Reformat both MS Fleet resource bodies as clean HTML (data-only migration)

Rewrite `service_resources.body` for the two MS Fleet rows using semantic HTML that the existing `prose` styles already support:

- **How to Fuel with the MS Fleet Card (Step-by-Step)** — break into:
  - `<h3>Before you start</h3>` intro paragraph
  - `<h3>Step-by-step</h3>` `<ol>` with 9 numbered steps (one `<li>` each)
  - `<h3>If the card is declined</h3>` short paragraph
- **MS Fleet Card — Quick Answers** — convert each Q into `<h3>Question</h3>` followed by a `<p>Answer</p>`, so questions are visually separated on mobile.

No prose or wording changes beyond formatting.

### 2. Make these resources "reference-only" (no completion, no checklist)

Add a new boolean column `is_reference_only` to `service_resources` (default `false`). When `true`:

- **ResourceViewer** (`src/components/service-library/ResourceViewer.tsx`) hides the "Mark Complete" button (Bookmark stays).
- **ServiceDetailPage** (`src/components/service-library/ServiceDetailPage.tsx`) skips these rows from the "Getting Started Checklist" counts/progress bar and never applies the `line-through` completed style to their titles.
- **DriverServiceLibrary** (`src/components/service-library/DriverServiceLibrary.tsx`) excludes them from Start-Here progress rollups.

Set `is_reference_only = true` and `is_start_here = false` on both MS Fleet rows in the same migration, and clear any prior completions for them so nothing shows crossed out:

```sql
DELETE FROM public.service_resource_completions
WHERE resource_id IN ('<step-by-step id>', '<faq id>');
```

### 3. Type + interface updates

- Add `is_reference_only: boolean` to `ServiceResource` in `src/components/service-library/ServiceLibraryTypes.ts`.
- Include it in the `select` used by `DriverServiceLibrary` so the flag flows through to both components.

### Out of scope

- No changes to the Comdata card, other services, or the Resource Center layout.
- No changes to bookmarks — drivers can still bookmark the MS Fleet instructions.
- No admin UI for the new flag right now (the flag is set directly by the migration for these two rows; a future edit form can expose it).

## Technical notes

- Files touched: `ResourceViewer.tsx`, `ServiceDetailPage.tsx`, `DriverServiceLibrary.tsx`, `ServiceLibraryTypes.ts`, plus one migration.
- Migration steps: `ALTER TABLE ... ADD COLUMN is_reference_only boolean NOT NULL DEFAULT false;` → `UPDATE` the two MS Fleet rows (new HTML body, `is_reference_only = true`, `is_start_here = false`) → `DELETE` their completions.
- `sanitizeRichHtml` already allows `h1`–`h6`, `p`, `ol`, `ul`, `li`, `strong`, `em`, so no sanitizer changes are needed.
