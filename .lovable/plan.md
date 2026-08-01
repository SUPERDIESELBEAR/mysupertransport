# HEIC upload path (Pass B §6) — revised

## Correction: confirmed against the live definitions, not by analogy

Read both functions from `pg_get_functiondef` rather than assuming the `record_source` pattern carries.

**`replace_rods_document` issues exactly one UPDATE against `rods_days`:**

```sql
UPDATE public.rods_days SET status = 'superseded', updated_at = now() WHERE id = v_old.id;
```

That is the only one — the replacement row is an `INSERT ... RETURNING`, and the third write is an `INSERT` into `rods_amendments`. The UPDATE touches `status` and `updated_at` and nothing else. Neither new column is in it.

**`enforce_rods_day_lock` on UPDATE** compares `NEW.record_source IS DISTINCT FROM OLD.record_source` before the lock test, with no `rods.privileged` escape, then applies the lock test *with* the privileged escape:

```sql
IF NEW.record_source IS DISTINCT FROM OLD.record_source THEN ... P0045
IF OLD.locked AND current_setting('rods.privileged', true) IS DISTINCT FROM 'on' THEN ... P0040
```

So the supersede UPDATE survives on two independent grounds: `record_source` is unchanged (`IS DISTINCT FROM` is false), and the locked-row test is waived by the `rods.privileged` guc the RPC sets immediately before. Adding `display_document_path` and `display_conversion_failed` as two more unexempted `IS DISTINCT FROM` checks in the same block is safe for exactly the same reason — the statement does not write them, so the comparison is false regardless of the guc. This holds because of what the UPDATE's SET list contains, not because `record_source` happens to be a literal in the INSERT; the analogy is not load-bearing.

One consequence worth stating: unexempted means unexempted. No future path may amend a filed day's display copy in place — a corrected display copy means a new row through `replace_rods_document`, which is the same rule the original already follows.

## 1. `renderable` keeps meaning "this device can draw it"

The encode happens on the writing device; truncation, partial upload and transit corruption happen after it. So hydration probes what it is about to cache, display bytes included:

- display bytes decode → cache, `renderable = true` (no re-encode; already display format)
- display bytes fail → discard, probe the **original**; if it decodes, cache it as display
- both fail → `renderable = false`, named-card fallback

Microseconds on a valid JPEG. The merge inherits it: it only embeds bytes this device decoded, so pdf-lib never meets a truncated JPEG, and non-renderable days get the named page.

## 2. The insert routes through `create_eld_document_day`

Not left as a client insert. The RPC changes anyway to carry the new columns, and the alternative is a certified `eld_document` row with every field client-supplied — the shape the bypass work just closed. Routing also gains the token idempotency the modal's direct insert lacks.

Coherence guards — the planned trigger does **not** cover these, so it is extended:

| state | resolution |
|---|---|
| `display_document_path` on a non-`eld_document` row | rejected |
| flag `true` **and** a display path set | contradictory — rejected |
| flag `false`, no display path | **legal.** A PDF or non-image is never converted. The flag means *conversion was attempted and failed*, not *no display copy exists*. Documented on the column. |
| display path pointing at no object | not assertable from Postgres. Handled at the read: a display object that won't fetch falls back to the original and probes it, same as a corrupt one. Still printable. |

## The change

**Conversion at upload.** `convertForDisplay(bytes, mime)` extracted from `renderability.ts` — one implementation, identical display bytes whichever path produced them (2s timeout, 2400px max edge, quality 0.85). `probeRenderability` calls it; so does the upload path.

`UploadEldLogModal.submit()`: original uploaded **first, always**; decodable image → JPEG to a sibling `…-display.jpg`; decode failure, timeout, or display-upload failure → original only, flag set; PDF/non-image → unchanged, no flag.

**Schema.** `display_document_path text` and `display_conversion_failed boolean not null default false` on `rods_days`, insert-only, threaded through `create_eld_document_day` and `replace_rods_document`, added to the unexempted immutability block, with the two coherence checks and new codes registered in `REJECTION_SQLSTATES`.

**Manifest.**

| case | `cached` | `renderable` | `printable` |
|---|---|---|---|
| converted, display bytes decode here | true | true | true |
| converted, display bytes corrupt, original decodes | true | true | true |
| flagged or both undecodable, bytes present | true | **false** | **true** |
| no bytes | false | false | false |

`printable: !!doc` already gives the flagged row the right answer — bytes exist, so print, download and merge stay available and an officer can open the file. `renderable = false` routes the officer screen to the named card.

**Driver copy.** Flagged upload succeeds with a note: on file, but this phone produced a format the app can't display, so it shows as a file. Never a rejection.

## Verification

1. **Flagged path, real HEIC** — one object, display path null, flag true, day present and not unavailable, named card on the officer screen.
2. **Converted path** — decodable photo; both objects land, the JPEG renders, day normal.
3. **Corrupt display object** — truncate the stored JPEG, re-hydrate, confirm fallback to the original rather than a broken image.

Headless Chromium cannot decode HEIC — the premise of the work. Case 1 is faithful there; case 2 cannot be driven with a HEIC, so converted-path evidence is a decodable image plus unit tests over `convertForDisplay`. End-to-end HEIC→JPEG needs a real iPhone and is a manual check for the owner. Each result reported as what it is.

## Tests
- `convertForDisplay`: decodable → JPEG; undecodable → null; timeout → null.
- Upload: conversion failure and display-upload failure both still file the day with the original and the flag.
- Hydration: valid display bytes renderable; corrupt display bytes fall back to the original; both bad → not renderable, still printable.
- Manifest: the four rows above.
- Trigger: two rejected coherence states, legal `false`/null accepted, and the supersede UPDATE still passing.
