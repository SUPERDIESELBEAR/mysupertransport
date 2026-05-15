## Problem

When a staff member returns an application for revisions, the applicant receives an email with an "Update my application" button, but clicking it navigates to `http://0.0.9.22/apply?resume=…` (see screenshot) — an unreachable host. The link generation is at:

- `supabase/functions/request-application-revisions/index.ts:168`
- `supabase/functions/request-application-resume/index.ts:90`

Both build the URL as:

```ts
const appUrl = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app';
const resumeUrl = `${appUrl.replace(/\/$/, '')}/apply?resume=${encodeURIComponent(tok)}`;
```

The fallback is only used when `APP_URL` is empty/unset. If `APP_URL` is set to something malformed (e.g. missing `https://`, or a stray value like a version string), the email renders a broken link with no scheme, and email clients then guess `http://<garbage>/apply?...`. The project does have an `APP_URL` secret configured.

## Fix Plan

### 1. Verify and lock down `APP_URL`

- Read what `APP_URL` is currently set to (ask the user to share or update it). Expected value: `https://mysupertransport.lovable.app` (or a verified custom domain).
- Add a runtime sanitizer in both edge functions: if `APP_URL` does not start with `http://` or `https://`, prepend `https://`; if it still doesn't parse as a valid URL, fall back to `https://mysupertransport.lovable.app`. Log a `console.warn` when the fallback fires so future misconfiguration is visible in edge logs.

### 2. Centralize the resume-URL builder

Add a shared helper in `supabase/functions/_shared/email-layout.ts` (or a new `_shared/urls.ts`):

```ts
export function buildAppUrl(path: string): string {
  let raw = (Deno.env.get('APP_URL') || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  try { new URL(raw); } catch { raw = 'https://mysupertransport.lovable.app'; }
  return raw.replace(/\/$/, '') + path;
}
```

Use it in both `request-application-revisions` and `request-application-resume` (and ideally roll it out to the other ~15 functions that duplicate the same `APP_URL` pattern, but that can be a follow-up — only the two resume functions are in scope for this fix).

### 3. Walk through the entire return-for-revisions flow

After the URL fix is in, do an end-to-end pass with one test application:

1. **Staff side** — open Tyler Walls (or a test applicant) in the Applicant Pipeline → Review drawer → "Return for revisions" with a sample message. Confirm:
   - `applications.review_status` flips to `revisions_requested`
   - `application_resume_tokens` row inserted with 7-day expiry
   - `audit_log` entry written
   - Resend log shows email sent (check edge function logs)
2. **Applicant side** — receive the email, inspect the rendered link in DevTools (right-click → copy link), confirm it begins with `https://mysupertransport.lovable.app/apply?resume=…`.
3. **Click the link** → `ApplicationForm.tsx` reads `?resume=` → invokes `consume-application-resume` → exchanges for a `draft_token` → loads the saved draft.
4. **Verify error states** in `ApplicationForm.tsx` (lines 156–176): expired, already-used, invalid all render the friendly screen rather than a broken page.
5. **Re-submit** the application and confirm `review_status` returns to `pending` and staff sees it back in the queue.

### 4. Add a defensive log in `consume-application-resume`

If the token is valid but the draft is missing, log enough context to debug (token id, application id) without leaking the raw token. This is cheap insurance against the next "applicant can't get back in" report.

## What I need from you before I implement

1. Confirm what `APP_URL` should be — `https://mysupertransport.lovable.app`, or a custom domain?
2. Permission to send a fresh "return for revisions" email to a real test applicant (Tyler Walls, or a different one you'd prefer) so I can verify end-to-end after the fix.

## Out of scope

- Refactoring `APP_URL` usage in the other edge functions (separate cleanup).
- Any change to the application form UI itself — this is purely the link/transport problem.
