## Approved scope — ready to execute on build mode

Running the full document-upload audit end-to-end:

1. **Code audit pass (read-only)** — grep every `supabase.storage.from(...).upload(` and `.uploadToSignedUrl(` call site and verify each has:
   - `withTimeout` wrapper (60s ceiling for uploads, 15s for fetches)
   - `try/catch/finally` that resets local `uploading`/`loading` state
   - Friendly toast on failure (no raw `err.message` leaks)
   - Orphan protection: DB insert inside the same try block; best-effort storage cleanup if the DB write fails
   - Any miss = fix ticket logged in the report before manual QA starts

2. **Test account provisioning** — call the `create-test-operator` edge function twice to create two isolated throwaway operators. Confirmed isolation: the function tags accounts with a test flag, uses synthetic emails, and does not touch any production driver records. Accounts will be listed by ID in the report and can be deleted after the run.

3. **Automated Playwright coverage** — script under `/tmp/browser/upload-audit/` that logs in as both test operators and walks every upload surface listed below, capturing screenshots at: file picker, mid-upload, post-upload list, and post-reload. Assertions: no `role="status"` spinner remains after 65s; DB row exists; storage object exists.

4. **Manual QA checklist** per surface: happy path, large file (~9 MB), slow-3G throttle, failure injection, cross-account, cross-device (desktop Chrome / iOS Safari PWA / Android Chrome PWA for representative flows + all camera captures), reload persistence, staff mirror.

**Surfaces covered:**
- Onboarding Stages 1, 2, 3 (incl. truck photos w/ environment camera), 4, 5, 5A, 6, 8, 9 (voided check / direct deposit)
- Document Hub uploads + re-uploads
- Driver Vault uploads
- Optional docs (`driver_optional_docs`)
- Decal photo capture (front/side + extras)
- Equipment Asset Sheet return shipping receipt
- Truck DOT inspection / maintenance record uploads
- Message attachments (if driver-attachable)
- ICA signature image write
- Application resume attachments during revision

5. **Deliverable** — `/mnt/documents/upload-audit-report.md` with per-surface rows containing: surface, path tested, device, result (pass/fail), screenshot links, DB/storage evidence, plus a prioritized fix list. All code-audit findings appear at the top before the manual QA results.

Approve to switch to build mode and I'll start with the code audit pass immediately.
