## Goal

In Stage 2 of the Onboarding Pipeline (management view), improve the "# files uploaded" popover + preview flow so that:

1. The popover closes automatically once a user clicks the gold **View** (magnifying glass) button.
2. The preview modal supports **← / →** navigation to flip through every file in that section (Truck Title, Form 2290, Truck Inspection, etc.) without reopening the popover.

## Scope

Single file: `src/pages/staff/OperatorDetailPanel.tsx`.

The popover + preview logic lives in the Stage 2 doc list (around lines 4774–4890) and the shared `stage2Preview` modal (line 6833). Truck Photos already uses a separate grid modal and is not affected. The Insurance Cert (Stage 7, line 5818) and PE Receipt (line 5613) previews use the same `stage2Preview` state and will inherit the nav upgrade automatically where a file list is available.

## Changes

### 1. Auto-close popover on View

Convert the `<Popover>` in the doc list from uncontrolled to controlled per field:
- Add local state `openPopover: string | null` (tracks which field's popover is open).
- Bind `<Popover open={openPopover === field} onOpenChange={...}>`.
- In the View button's `onClick`, call `setOpenPopover(null)` right before/after setting `stage2Preview`.

### 2. Prev / Next navigation in preview

Extend `stage2Preview` state shape to carry the sibling list + current index:

```
{ url, name, docType, appField?, files?: OperatorDoc[], index?: number }
```

When opening from the popover, pass `files` (the current `files` array for that field) and the clicked file's `index`.

In the `FilePreviewModal` render block (line 6833), when `files` has more than one entry:
- Show left/right chevron buttons overlaid on the modal (disabled at boundaries, or wrap).
- On click, resolve a fresh signed URL for the neighbor file (same `operator-documents` bucket + path logic already used in the View handler), then update `stage2Preview` with the new url/name/index.
- Show a small "n of N" counter next to the file name.
- Add keyboard support: ArrowLeft / ArrowRight while the modal is open.

Extract the signed-URL resolution into a small local helper (`resolveSignedUrl(file)`) so the popover click and the prev/next handlers share one code path.

### 3. Leave unrelated flows alone

- Truck Photos grid, Insurance Cert single-file case, PE Receipt single-file case, and application-doc previews (`docType === 'application_doc'`) keep their current behavior; nav arrows only render when `files.length > 1`.
- No DB, RLS, or edge-function changes.

## Technical notes

- `FilePreviewModal` is a presentational modal — adding `onPrev`, `onNext`, and a `counter` prop (all optional) keeps it backward compatible with every other caller.
- Signed URLs are already fetched on-demand (1 hr TTL), so navigating between files simply requests the next signed URL; no bulk pre-fetch needed.
- Keyboard handler attaches on mount of the modal and cleans up on unmount to avoid leaking listeners between openings.

## Out of scope

Truck Photos grid navigation (already has its own grid UX), and any changes outside Stage 2 wiring except the shared modal enhancement, which naturally benefits any other caller that opts in by passing a `files` array.
