# The signature is missing from every downloaded application

## What is actually happening

It is not an old-vs-new application problem. The signature is missing from **all** generated PDFs, old and new, because the PDF generator looks for the signature file in the wrong place.

Both uploaded PDFs confirm it: the certification page prints the printed name and the date, and the signature line is blank. Neither file contains a signature image at all — the only image embedded is the letterhead logo.

## The cause

Signature images are stored under a key that repeats the folder name, for example:

```text
bucket: signatures
key:    signatures/260920d7-.../1787495613902_gtixiy2bkd.png
```

The application record stores that exact key. The on-screen viewer signs the key as stored and finds the image, which is why the signature shows correctly in the app.

The PDF function does something different: it strips a leading `signatures/` before downloading, so it asks for `260920d7-.../1787495613902_gtixiy2bkd.png`, which does not exist. The download fails, and the code is written to carry on quietly with no signature rather than fail — so the PDF is produced looking complete, minus the signature.

Confirmed across the records: 220 applications store the prefixed form, 1 stores a bare path, 2 store a full URL, 97 have no signature on file at all.

## The fix

1. In the PDF function, resolve the signature by trying the stored key exactly as it is first, and only then the de-prefixed form as a fallback. This covers the 220 prefixed rows, the 1 bare row, and keeps the two full-URL rows working through the existing URL parsing.
2. Stop the silent fallthrough. When an application has a signature on file but the image cannot be downloaded, log it and return a clear error instead of shipping a compliance document with a blank signature line. A missing signature must be visible, not invisible.
3. Applications with genuinely no signature on file (the 97) continue to render the blank signature line as they do today — that is correct.

Nothing is written to the database and no stored paths are rewritten; the reader is corrected to match the data as it exists.

## Verification

Regenerate the PDF for Daniel Vazquez Gonzalez and Jonathan Grant, and confirm the signature image is embedded on the certification page of each.

## Technical notes

- File: `supabase/functions/generate-application-pdf/index.ts`, function `storagePathFor` and the download block that follows it.
- Candidate list order: raw stored value, then value with a leading `signatures/` removed; for `http(s)` values keep the existing marker-based extraction.
- Redeploy the edge function after the change.
