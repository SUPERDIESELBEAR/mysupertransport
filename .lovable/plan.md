## Plan 1 — Handbook + BOL/POD upload in Document Hub

Adds the two uploaded PDFs into the existing Document Hub (Documents tab) as first-class driver documents, using the current PDF content type — no new UI or schema. FAQ generation ships as **Plan 2** after this is approved.

## What ships

Two new records in `driver_documents`, each with `content_type = 'pdf'`:

| # | Title | Category | Required | Blocks Go Live | Visible | Pinned | Source |
|---|-------|----------|----------|----------------|---------|--------|--------|
| 1 | SUPERTRANSPORT Handbook | Onboarding | Yes | Yes | Yes | Yes | `SUPERTRANSPORT_Handbook_2.0_2026_July.pdf` |
| 2 | BOL / POD Procedures | Compliance | Yes | No | Yes | No | `SUPERTRANSPORT_BOL_POD_Procedures_v2.0_2026_July.pdf` |

Only the Handbook blocks Go Live (per your answer). BOL/POD is required-to-acknowledge but does not gate Go Live — flag if you want it to gate too.

Description text (short, appears on the card):
- Handbook: "Company policies, expectations, and driver conduct standards. Review and acknowledge."
- BOL/POD: "How to handle Bills of Lading and Proofs of Delivery on every load."

`estimated_read_minutes`: Handbook ~20, BOL/POD ~8 (rough page-count estimate; adjustable).

## Steps

1. **Upload both PDFs to storage** — bucket `resource-library`, path prefix `doc-hub-pdfs/` (matches the current editor's convention). Use `supabase--storage_upload` from the local `/mnt/user-uploads/...` files.
2. **Insert two rows** into `public.driver_documents` via the insert tool, populating `title`, `description`, `category`, `content_type='pdf'`, `pdf_url` (public URL), `pdf_path` (storage key), `is_visible=true`, `is_required=true`, `blocks_go_live` per table, `is_pinned` per table, `estimated_read_minutes`, `version=1`, `sort_order` (Handbook first).
3. **No code changes.** Records show up in the admin Documents tab and the driver Document Hub via existing queries. Handbook triggers the existing "action required" pill on the driver side and the Go Live gate on staff.

## Verification

- Admin → Document Hub → Documents tab: both cards appear, editable via the existing "New Document" modal.
- Driver → Document Hub: both cards appear in their categories; opening either loads the PDF in the viewer.
- Handbook shows in the Go Live requirements list until acknowledged.

## Out of scope (deferred to Plan 2)

- Parsing Handbook content into individual FAQ entries.
- Adding a `handbook` value to the `faq_category` enum.
- Any FaqManager changes.
