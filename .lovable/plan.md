# Pass 2C — Load Documents, Loadout Galleries & Exceptions

Extends the existing Load Detail page only. Pass 1 / 2A / 2B sections, the Create Load form, and the Loads list are untouched. No changes to the `load_documents` or `document_exceptions` column structures.

## Part 1 — Storage

New private bucket `load-documents`, 25 MB per file, MIME allowlist: PDF, JPEG, PNG, HEIC/HEIF, WebP. Client-side validation rejects anything else with a clear message before an upload is attempted.

Object paths: `{load_id}/{document_type}/{uuid}-{filename}`.

Policies on `storage.objects` for this bucket:
- Management, owner, dispatcher, onboarding_staff: read, upload, delete.
- Operators: read only, and only when the first path segment is a load whose `operator_id` maps to their own `operators` row (`operators.user_id = auth.uid()`), resolved through `load_documents`.
- No anonymous access.

Server-side attribution: a BEFORE INSERT trigger on `load_documents` fills `uploaded_by` from `public.current_profile_id()` when the client leaves it null, so the client never supplies an identity. Same approach for `resolved_by` on `document_exceptions` updates. No columns are added or altered.

## Part 2 — Documents section

New section between the Stops timeline and Notes. Lists every `load_documents` row for the load except the two loadout inspection types, grouped by document type in operational order (rate confirmation, revised rate confirmation, BOL, POD, scale ticket, lumper receipt, detention documentation, permit, broker correspondence, other).

Each row shows the type label, document/original filename, upload timestamp, uploader name, upload channel, and file size when known. Image files get a thumbnail; PDFs get a file-type icon. Actions: view (signed URL, new tab) and download for everyone; delete with a confirmation dialog for management, owner, and dispatcher only.

## Part 3 — Upload

Upload control in the section header for management, owner, dispatcher, and onboarding_staff. Operators get a read-only list with no control.

Dialog: pick one or more files, choose one document type for the batch, optionally attach to a specific stop from this load, add a note. Per-file progress with graceful partial failure — successes stay, failures are reported individually. `upload_channel` is set to `office_upload`. Drag-and-drop onto the section works as an alternative to the picker.

## Part 4 — Loadout galleries

When `load_type = 'loadout'`, inspection photos render as two galleries instead of list rows: Pickup Inspection and Delivery Inspection, each with a photo count in the heading and an empty-state line when the inspection has not been submitted.

Responsive thumbnail grid ordered by `photo_sequence`, `photo_label` beneath each tile, and a clear damage badge on any tile with `damage_noted`. Clicking opens a lightbox with the full image, label, capture timestamp, GPS coordinates when present, and damage notes; arrow keys and on-screen controls move between photos within that group.

## Part 5 — Exceptions

Subsection inside Documents listing `document_exceptions` for the load, with unresolved (pending) ones surfaced prominently at the top so billing sees them before invoicing.

Each shows the missing document type, the reason in plain language, driver notes, who reported it and when, eBOL reference when present, and status.

No create action — exceptions originate from the driver. Management, owner, and dispatcher get a Resolve dialog with three outcomes: approved (proceed without the document), resolved (link one of the documents already attached to this load, stored in `resolving_document_id`), or denied. All three require resolution notes; `resolved_at` and `resolved_by` are set server-side.

Operators see exceptions on their own loads read-only, with resolution notes withheld — the same gating pattern already used for internal notes and status-change notes.

## Part 6 — Tests

Extends `src/pages/dispatch/__tests__/loadDetailOperatorAccess.test.tsx`: an operator on their own load sees the document list but no upload control, no delete actions, and no resolution controls; resolution notes are absent from the operator render and present for a dispatcher on the same load. Failing assertions get reported, not loosened.

## Technical notes

New files under `src/components/dispatch/loadDetail/` (documents section, upload dialog, loadout gallery + lightbox, exceptions list, resolve dialog) plus a `src/lib/loadDocuments.ts` data layer. Fetch/mutate through TanStack React Query following existing patterns, invalidating document and exception queries after upload, delete, and resolution. Errors surfaced via `getDbErrorMessage` / `logDbError`. Existing shadcn components and the charcoal/gold tokens only. Supabase RPC calls go through the context-preserving helper pattern already in `loadDetail.ts`.
