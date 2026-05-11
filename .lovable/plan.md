## What's broken

I tested `/apply` on the live site — it loads cleanly, no console errors, and one applicant did submit successfully today. But code review of the submit path on Step 9 (Signature) surfaced three real bugs that explain why mobile applicants would say "I can't submit":

1. **Signature gets wiped on iOS Safari address-bar collapse.** `Step9Signature.tsx` attaches a `ResizeObserver` to the signature wrapper. Its callback re-sizes the canvas (which always clears the HTML5 buffer) AND explicitly calls `sigRef.current?.clear()` + sets `signature_image_url` to `''`. On mobile, the URL bar hides as the user scrolls, which fires a resize → the saved signature disappears silently. We already documented this exact pitfall in memory for the ICA flow (`ica-signing-reliability`) but the application form never got the same treatment.
2. **`handleSubmit` skips `validateStep(9, ...)`.** Every other step runs validation in `goNext`, but the Submit button calls `handleSubmit` directly. So if SSN, typed name, or signature is missing, the form submits a partial payload instead of showing a field error.
3. **`handleSubmit` ignores Supabase errors.** `.update()` / `.insert()` are awaited but the `{ error }` is never read, and there's no `try/catch` around the encrypt-ssn `fetch`. A failed insert (RLS, constraint, network) still flips `setSubmitted(true)` and the applicant sees the success screen with no record actually saved. Same hole exists in `saveDraft`.

Combined, an iOS user who scrolls between signing and tapping Submit ends up with: signature cleared → submit fires → partial payload → silent DB rejection → "thank you" page → applicant later told "we never received it."

## Fix

### 1. `src/components/application/Step9Signature.tsx`
- Size the canvas **once on mount** (or only when width actually changes — track previous width and skip re-init if equal). Drop the `ResizeObserver` clearing behavior entirely.
- When the canvas legitimately needs re-init (orientation change), preserve the existing `signature_image_url` rather than blanking it.
- Add a `hasDrawn` state mirror so the Saved ✓ indicator and parent validation reflect actual canvas state, matching the ICA pattern.

### 2. `src/pages/ApplicationForm.tsx` — `handleSubmit`
- Run `const errs = validateStep(9, formData);` first; if any errors, `setErrors(errs)`, scroll to top, show a `toast` ("Please complete all required fields"), and bail before encrypting SSN.
- Wrap the `encrypt-ssn` `fetch` in `try/catch`; if it fails or returns no `encrypted`, surface a toast and abort (don't silently store NULL SSN).
- Capture `{ error }` from the `applications` `.update()` / `.insert()`; on error, `throw` it, show a toast ("We couldn't submit your application — please try again or contact us"), and do **not** set `submitted=true`.
- Same loud-failure treatment for `saveDraft`.

### 3. Telemetry
- Log submit failures to `audit_log` (action `application_submit_failed`, entity_type `application`, metadata `{ stage, error_code, email }`) so we can see future failures without waiting for applicants to call.

## Verification

- Reload `/apply` on mobile viewport (390×844), fill all 9 steps, scroll the page after signing to trigger the iOS resize, then submit — signature must persist and submit must succeed.
- Submit with empty signature/SSN — must show inline errors + toast, no DB write.
- Force a DB error (e.g., temporarily violate a constraint in dev) — must show toast and stay on Step 9, not advance to "thank you."
- Confirm Sanjay-style happy-path submit still records into `applications` with `review_status='pending'`.

## Out of scope

No schema changes, no edge function rewrites beyond keeping the existing encrypt-ssn contract, no UI redesign of Step 9 — just reliability fixes to the submit pipeline.
