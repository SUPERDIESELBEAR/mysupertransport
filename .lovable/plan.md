

## Email-based resume for unfinished applications

Applicants can currently only resume a draft on the same browser/device where it was saved (via `localStorage`). This plan adds an **email-based resume flow**: an applicant enters their email, receives a secure link, and lands back in the application with their progress restored — on any device.

It also adds a **"Resume application" banner** on the splash page so applicants who return later have a clear, obvious entry point.

### What the user will see

**1. "Resume application" banner on the splash page (`/`)**
- A prominent banner above the hero: *"Started an application? Pick up where you left off →"*
- Clicking it opens a lightweight "Resume" dialog.

**2. Resume dialog**
- Single email input + "Send resume link" button.
- Always responds with the same confirmation message (*"If an application exists for that email, we've sent a resume link"*) to avoid leaking which emails are in our system.
- No rate-limit prompts visible to the user beyond a friendly "Please wait a moment before trying again."

**3. Email**
- Subject: *"Resume your SUPERTRANSPORT application"*
- Body: branded, short, with a single primary button "Resume application" → link valid for **24 hours, single use**.
- Sent via Lovable's built-in transactional email system (no third-party provider).

**4. Resume landing (`/apply?resume=<token>`)**
- The application form validates the token, restores the draft, and shows the existing gold "Your previous progress has been restored" banner.
- If the token is invalid/expired/used, a clear message: *"This resume link has expired. Request a new one from the home page."* with a button back to the splash.

**5. Draft save UX tweak**
- When the applicant clicks "Save Progress" and they have an email on file, a small confirmation toast: *"Saved. You can resume from any device — just enter your email on the home page."* (no email sent here; this is informational only).

### How it works (technical)

**Backend**

- New table `application_resume_tokens`:
  - `token text PRIMARY KEY` (random 32-byte URL-safe)
  - `application_id uuid REFERENCES applications(id) ON DELETE CASCADE`
  - `email text NOT NULL`
  - `expires_at timestamptz NOT NULL` (24 h)
  - `used_at timestamptz`
  - `created_at timestamptz DEFAULT now()`
  - RLS: no client access (service-role only). Applicants never query it directly.

- **Edge function `request-application-resume`** (public, `verify_jwt = false`):
  - Input: `{ email }` validated with zod.
  - Rate-limit: max 3 requests per email per hour (tracked by timestamp on recent tokens).
  - Looks up the most recent `applications` row where `lower(email) = lower(input)` AND `is_draft = true`.
  - If found: creates a resume token, enqueues a transactional email with the resume URL (`${APP_URL}/apply?resume=<token>`).
  - **Always returns 200** with a generic success message (no account enumeration).

- **Edge function `consume-application-resume`** (public, `verify_jwt = false`):
  - Input: `{ token }`.
  - Validates: exists, not used, not expired.
  - Atomically marks `used_at = now()` and returns `{ draft_token }` for that application.
  - The client then stores `draft_token` in `localStorage` and reuses the existing `get_application_by_draft_token` flow — **no duplication of the restore logic**.

- **Transactional email template** `resume-application.tsx` (React Email): branded with SUPERTRANSPORT gold, includes applicant first name if available, single CTA button, expiry note.

**Frontend**

- `src/pages/SplashPage.tsx`: add a "Resume application" banner (above hero) that opens a new `ResumeApplicationDialog`.
- New `src/components/application/ResumeApplicationDialog.tsx`: email input + submit → calls `request-application-resume` → shows generic confirmation.
- `src/pages/ApplicationForm.tsx`: on mount, if `?resume=<token>` in URL:
  1. Call `consume-application-resume` with the token.
  2. On success, store returned `draft_token` in `localStorage`, strip the query param from the URL, and fall through to the existing draft-load path (which already shows the restore banner).
  3. On failure, show an inline error card with a "Back to home" button.

**Infrastructure prerequisites**

- Requires email domain + transactional email scaffolding (Lovable Emails). If not yet set up, the setup dialog will appear first, then this work continues automatically.

### Security & privacy

- Tokens are 32-byte URL-safe random (not UUIDs) stored server-side only.
- Single-use, 24-hour expiry.
- Generic API responses prevent email enumeration.
- Rate-limited per email to prevent abuse.
- No applicant data returned from `request-application-resume` — the draft is only loaded after token consumption on the resume URL.

### Out of scope

- No change to the existing localStorage-based resume (still works for same-device).
- No change to submitted applications (resume only applies to `is_draft = true` rows).
- No "forgot my email" flow — applicants must know the email they applied with.

