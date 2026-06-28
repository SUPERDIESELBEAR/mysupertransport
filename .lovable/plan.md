## What's actually happening

This is not a system bug — it's a data issue we can both clean up and guard against.

Delease Carter's PEI rows have `employer_contact_email` values like:

- `paperwork@tcservices.biz  219-476-1300`
- `support@cloudtrucks.com   (415) 480-2336`

That string contains a valid email **plus** a phone number jammed into the same field. The send-email validator requires a single clean address (no spaces, no extra characters), so it correctly rejects these and shows "missing or invalid." The same combined value lives in `applications.employers` JSONB and was copied into `pei_requests` when the queue rows were created — so editing the PEI row alone won't help future applicants if the form keeps accepting it.

## Fix in three coordinated parts

### 1. Sanitize on send (defensive, helps existing rows immediately)
`src/components/pei/sendPEIEmail.ts`
- Before validating, extract the first email-shaped token from `employer_contact_email` with a strict regex (`[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}`). If found and valid, use that as `recipient`.
- If still nothing valid, throw a clearer message: *"The previous employer's email looks invalid (it may contain extra text like a phone number). Open the applicant's PEI tab and click Edit on this employer to correct it."*

### 2. Sanitize on PEI row creation and on inline edit
- `src/lib/pei/api.ts` (line ~187): extract the email-shaped token from `e.contact_email || e.email` before inserting into `pei_requests`.
- `src/components/pei/ApplicationPEITab.tsx` `saveEdit`: same extraction so staff can paste "email + phone" and the system stores just the email.

### 3. Backfill existing bad rows (one-time SQL)
Migration that scans `pei_requests` where `employer_contact_email ~ '\s'` and rewrites it to the first email-shaped substring (or NULL if none). Affects Delease's two rows plus any others created the same way.

## What's not changing
- No edge-function changes.
- No email-template, queue, domain, or DNS changes.
- Application form Step 3 still uses the existing email field; we just clean the value on the boundary rather than rewriting the form schema.

## Verification
1. Re-run "Send First Attempt" for Delease's Keystone Lines and Cloud Trucks rows — both should send and advance to `sent`.
2. Inline-edit a PEI row with `"foo@bar.com 555-1212"` and confirm only `foo@bar.com` is stored.
3. Create a fresh PEI request from an applicant whose employer JSONB has a polluted email and confirm `employer_contact_email` is stored clean.
4. Confirm a row with truly no email still surfaces the friendly error.
