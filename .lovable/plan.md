# Generate FAQs from Documents

Turn uploaded policy PDFs (Handbook v2.0, BOL/POD Procedures, and future documents) into reviewable **draft** FAQs in the existing FAQ Manager. Nothing publishes automatically — staff review, edit, and publish.

## How it works

1. Staff opens **Management → FAQ Manager** and clicks a new **"Generate from document"** button.
2. A modal lets them pick:
   - A PDF from the `resource-library` bucket (Handbook, BOL/POD, etc.) or upload a new one.
   - Target audience: **Owner-Operator** (default) or **Staff**.
   - Optional category hint (auto-detected if left blank).
3. Backend extracts the PDF text, chunks it by section, and asks Lovable AI (Gemini) to draft 3-8 Q&A pairs per section grounded strictly in that section's text.
4. Each generated Q&A is embedded and compared against existing FAQs; near-duplicates are skipped.
5. Survivors are inserted into the existing `faq` table as **drafts** (`is_published = false`), tagged with the source document filename and section so staff can trace them.
6. Staff reviews in the current FAQ Manager list — edit, retag, publish, or delete like any other FAQ.

## Where results land

The **existing FAQ Manager page**. New drafts appear alongside hand-written FAQs, filtered by the current audience toggle. A "Draft" badge is already shown; drafts also get a small "AI • <source doc>" tag so staff can bulk-filter them.

## Backend

- **Edge function `faq-generate-from-doc`** (verify_jwt = false, staff-authenticated in code):
  - Input: `{ storage_path, audience, category_hint? }`
  - Downloads PDF from `resource-library`, extracts text with `pdfjs-dist` (npm:), splits by headings.
  - For each section: calls `google/gemini-3-flash-preview` via the Lovable AI Gateway with a strict prompt ("Only use facts from the passage; questions must be things a driver would actually ask; answer in ≤120 words; no invented policy").
  - Embeds each candidate Q with `google/gemini-embedding-2` and compares (cosine ≥ 0.88) against embeddings of existing published + draft FAQs for the same audience; drops duplicates.
  - Inserts survivors into `faq` with `is_published=false`, `audience`, `category`, `tags=[source_filename, section_title, 'ai-draft']`, `source_document`, `source_section`.
  - Returns counts: `{ generated, inserted, skipped_duplicate }`.

- **Migration** (schema only — no bulk data):
  - Add `source_document TEXT`, `source_section TEXT` to `faq`.
  - Add `faq_embeddings` table (`faq_id`, `embedding vector(768)`) or reuse `search_vector`; use a lightweight `numeric[]` column if pgvector isn't enabled. Confirmed approach: `numeric[]` + in-function cosine to avoid adding pgvector.
  - Standard GRANTs + RLS: staff-only read/write, mirroring existing `faq` policies.

## Frontend

- `src/components/management/FaqManager.tsx`:
  - Add **"Generate from document"** button next to "New FAQ".
  - New modal `GenerateFaqsFromDocModal.tsx`: PDF picker (lists `resource-library` PDFs), audience selector, "Generate" button, progress + result summary.
  - After success: refetch FAQ list, scroll to newest drafts, show toast `"Created N drafts (skipped M duplicates)"`.
  - Add a "AI drafts only" filter chip in the manager.

## Run against current PDFs

After the flow ships, I run it once for:
- `SUPERTRANSPORT_Handbook_2.0_2026_July-2.pdf` → Owner-Operator drafts.
- `BOL_POD_Procedures_2.0.pdf` → Owner-Operator drafts.

Then report draft counts so you can start reviewing in FAQ Manager.

## Out of scope

- Auto-publishing. Everything stays a draft.
- Editing the driver-facing FAQ page (no changes needed — existing publish flow surfaces approved items).
- Re-generating on every PDF edit; staff triggers manually per document.
