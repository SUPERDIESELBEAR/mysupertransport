## Technical detail

**New component — `ApplicationPdfPreviewModal.tsx`** (`src/components/management/`)

- Props: `applicationId`, `applicantName`, `onClose`.
- On mount, invokes the existing `generate-application-pdf` function once, fetches the signed URL to a blob, and holds a single `URL.createObjectURL` reference for the modal's lifetime (revoked on close).
- Renders the blob in an `<iframe>` sized to the dialog body, letting the browser's native PDF viewer handle scrolling, zoom, and page navigation. This is what guarantees the preview is byte-identical to the download — it is the same bytes.
- States: generating (spinner + "Building the document…"), ready, and failed (error text with an **Open in new tab** escape hatch and a note pointing at browser Print).
- Footer actions:
  - **Download** — anchor against the already-held object URL using the `filename` the function returned.
  - **Print** — `iframe.contentWindow.print()`, with a fallback to opening the object URL in a new tab when the frame is cross-origin-restricted or on iOS, matching how `FilePreviewModal` already handles PDFs.
- Sizing follows the project's mobile rule: `max-h-[90dvh]`, full-width on small screens.

**Wiring — `SubmittedApplicationSnapshot.tsx`**

- Add a **Preview** button before Download PDF; keep Download PDF and Print application unchanged so nothing regresses if the modal is closed.
- The blob-download logic currently inline in `handleDownloadPdf` moves into a small shared helper so the card and the modal use one code path (generate → blob → save), rather than two copies drifting apart.

**Not changing**

- `generate-application-pdf` itself, its staff-only role check, and the shared document model stay exactly as they are — the preview is a new consumer of the same endpoint, not a new rendering path.
- The four standalone disclosure PDFs in `ApplicationReviewDrawer` keep their existing browser-print behaviour; converting those to the server renderer is separate work.
