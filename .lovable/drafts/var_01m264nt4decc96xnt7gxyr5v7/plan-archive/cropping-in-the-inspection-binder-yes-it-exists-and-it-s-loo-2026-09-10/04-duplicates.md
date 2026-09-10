# Part 2 — stop the same document going in twice

Three layers, all built in this pass.

**Layer 1 — recognise the file by its contents, not its name.** On upload, a short signature is calculated from the file's bytes before anything is stored. If a document with the same signature is already on that driver's binder, the upload pauses and says who put it there and when, with a choice: Keep the one on file, or Upload anyway. A renamed copy of the same scan has the identical signature, so renaming defeats nothing.

**Layer 2 — one live document per slot, older ones filed underneath.** Each slot (this driver, this document type) keeps exactly one current document. A second upload becomes the new current version and pushes the previous one into History, which the binder already shows. No slot can end up with two competing rows again. This closes the real cause of today's duplicates: the Vehicle Hub sync and the binder upload each created their own row instead of versioning.

**Layer 3 — a stale-view check.** If the slot changed after you opened it — a colleague uploaded while you were choosing a file — saving stops and says "Kenneth replaced this 40 seconds ago", showing both, so nobody's work is silently overwritten.

## Part 3 — the duplicates already on file

Five slots hold more than one copy today. All are the same document uploaded twice within minutes, not competing documents:

| Driver | Slot | Copies | Note |
| --- | --- | --- | --- |
| Delease Carter | Periodic DOT Inspections | 2 | Same photo, 33 seconds apart. Expiry differs: 7/7/2026 vs 7/7/2027 |
| Delease Carter | Lease Agreement (ICA) | 2 | Two PDFs, 35 seconds apart |
| Justin Herr | CDL (Back) | 2 | Same image, 12 seconds apart |
| Johnathan Pratt | IRP Registration (cab card) | 2 | Two PDFs, 5 minutes apart, same expiry 8/31/2027 |
| Wendell James | Periodic DOT Inspections | 3 | July 23 photo plus the July 27 photo recorded twice |

Nothing is deleted in this pass. Once the versioning is in place I will bring you this list inside the app, one slot at a time, so you can pick which copy stays current — the rest move into History rather than disappearing. Delease's Periodic DOT pair needs your eye first, because the two copies carry different expiry dates and only one can be right.

## Technical notes for parts 2 and 3

- Staged additive migration: `content_hash text` and `superseded_by uuid` (or reuse `inspection_document_versions`, which already exists and is append-only) on `inspection_documents`, plus an index on `(driver_id, name, content_hash)`. No drops, no renames.
- Hash client-side with `crypto.subtle.digest('SHA-256', bytes)` before upload; store the hex digest. Duplicate check is a single read filtered by driver, slot and hash.
- Versioning routes through the existing `archive_inspection_document_version` function so History keeps working; the Vehicle Hub DOT sync writer must be pointed at the same path rather than inserting its own row.
- Stale-view check compares the `updated_at` the client loaded against the current row inside the update, refusing on mismatch.
- Because these are new database pieces, the duplicate warning and versioning only start working once the draft is accepted. The crop fix in Part 1 works immediately.
