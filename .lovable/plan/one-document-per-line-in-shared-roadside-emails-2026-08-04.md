# One document per line in shared roadside emails

The email in the screenshot came from the plain-text path (the "use my mail app" fallback body), not the branded HTML email. Mail clients treat that text as "flowed" and re-join single line breaks, so all 9 documents run together into one paragraph.

## What changes

Rework the plain-text email body in `src/lib/binderShareFormat.ts` so each document survives client reflow:

- Put number, title, and link on one line per document: `1. CDL (Front) — https://.../s/7d30727e`
- Separate every document with a blank line (the only break mail clients reliably keep), so each item renders on its own line.
- Drop the long `────────────` rules, which wrap badly and pull the first item up onto the header line. Use a simple `DOCUMENTS (9)` heading followed by a blank line.
- Keep the footer (`Shared: ...`, `From: SUPERTRANSPORT ...`, `Powered by SUPERDRIVE`) but blank-line separate those lines too so they don't collapse into one sentence.

Apply the same one-line-per-document + blank-line-between rule to the plain-text alternative in `supabase/functions/_shared/binder-share-email.ts` (`binderShareText`), so recipients whose clients block HTML get the same clean list.

## Technical notes

- Text assembly only; no schema, auth, or link-generation changes.
- The branded HTML email (gold **View** buttons, one row per document) is unchanged — it already lists one document per row.
- SMS formatting stays as-is.