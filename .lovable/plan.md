# Add Search to Admin Document Hub

## Context
The driver-facing Document Hub already has a search bar (filters by title, description, body). The **admin/management** Document Hub (the `isAdmin` branch in `src/components/documents/DocumentHub.tsx`) has no search — only the "Documents" / "Compliance" tab switcher above the full `AdminDocumentList`.

## Change
Add a search input to the admin "Documents" tab, above `AdminDocumentList`, that filters the documents passed into the list in real time.

### Where
`src/components/documents/DocumentHub.tsx` — admin branch, inside `{adminTab === 'documents' && …}`.

### UI
- Same visual treatment as the driver search bar: `Search` icon inset-left, `Input` with `pl-9`, placeholder `"Search documents by title, description, category, or content…"`.
- Render directly above the white results panel; full-width on mobile, capped at `max-w-md` on `sm+`.
- Show a small "`N` of `M` documents" count to the right when a query is active.

### Matching (keyword detection)
Case-insensitive, whitespace-tokenized AND match — every token in the query must appear in at least one of the searched fields. Fields searched per document:
- `title`
- `description`
- `category` (so typing `policy` matches the Policies category)
- `body` (rich-text content; tags stripped via a simple `.replace(/<[^>]+>/g, ' ')` before matching so users can find docs by phrases inside the document)
- File hint: when `pdf_url` exists, include the filename segment of the URL

Implementation: reuse the existing `search` state (already declared at line 27) so the filter logic stays in the parent. Build a memoized `adminFilteredDocs` derived from `documents` + `search`, then pass it to `AdminDocumentList` instead of `documents`.

### Empty state
When the filter returns zero rows, render a centered "No documents match your search" message inside the white panel (same `FileText` icon style used in the driver empty state) with a `Clear search` text button.

## Out of scope
- No backend changes; filtering is client-side over the already-loaded `documents` array (admin already fetches the full list).
- No changes to the Compliance tab, the driver view, sort order, drag-to-reorder, ack counts, or category coloring.
- No fuzzy/typo-tolerant search (Algolia/Fuse) — straightforward tokenized substring matching is sufficient for the current list size and matches the existing driver-side behavior.
