# Preview the application PDF before downloading

Today the only way to see the branded application document is to download it. Staff click **Download PDF**, the file lands in the downloads folder, and if something looks wrong they delete it and try again.

This adds a **Preview** step: staff open a modal, see the exact server-rendered document — same letterhead, same pagination, same wording as the file that gets emailed or archived — and download or print from inside that modal.

Scope decisions already made:

- **Staff-only.** The generator stays behind the existing staff role check. No new public or applicant access path.
- **Modal, not a route.** A full-height dialog over the review screen, so staff keep their place in the application.

## What changes for staff

- A **Preview** button sits next to Download PDF on the Submitted Application card.
- Clicking it generates the document once and shows it inline, with page navigation handled by the browser's built-in PDF viewer.
- The modal footer carries **Download** and **Print** — both reuse the already-generated file, so no second round trip and no chance of previewing one version and downloading another.
- If generation fails, the modal shows the reason and offers the existing browser-print fallback.
