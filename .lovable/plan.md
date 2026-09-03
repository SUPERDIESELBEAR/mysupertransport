# Resume-link "already used" — read-only investigation

Report only. Nothing was changed.

## 1. The token mechanism

`consume_application_resume_token(p_token text)` is defined in exactly **one** migration:
`supabase/migrations/20260421161507_1a3e4dd0-f7c2-4200-9c38-986724be54eb.sql`. The live
catalog definition (`pg_get_functiondef`) is byte-identical to it: `SECURITY DEFINER`,
`SET search_path TO 'public'`, `plpgsql`.

What it does, in order:

1. Looks the token up by primary key; missing -> `invalid_token`.
2. `used_at IS NOT NULL` -> `token_used`.
3. `expires_at < now()` -> `token_expired`.
4. **Writes `used_at = now()`** — before it has looked at the application at all.
5. Only then reads `applications` for `draft_token` where `is_draft = true`; if that
   fails -> `application_not_found`.

Two consequences follow from that ordering:

- The token is burned on the *attempt*, not on a successful delivery to the browser. If
  the caller never receives the response — closed tab, dropped connection, back button
  mid-request — the token is spent anyway.
- If the application is no longer a draft (already submitted), the exception at step 5
  rolls the transaction back, so `used_at` is *not* persisted in that one case. In every
  other path where the token is found, valid and unexpired, it is consumed.

**No reuse is possible under any condition.** There is no grace window, no session
binding, no counter — a single `used_at` timestamp, checked strictly for NULL.

`application_resume_tokens` (live `information_schema`):

| column | type | null | default |
|---|---|---|---|
| token | text | NO | — (PRIMARY KEY) |
| application_id | uuid | NO | — |
| email | text | NO | — |
| expires_at | timestamptz | NO | — |
| used_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |

Constraints (`pg_constraint`): primary key on `token`, foreign key
`application_id -> applications(id) ON DELETE CASCADE`. **No check constraints, no unique
constraint other than the PK, no partial index enforcing one live token per email.**
Expiry is data-only: `expires_at` is set by the issuing edge function (24h for the
self-service resume request, 24h–7d for the staff resend depending on status) and read
only inside the function above. Nothing purges used or expired rows.

Grants (live): `anon` and `authenticated` have **no** table privileges on
`application_resume_tokens`; `anon` **can** EXECUTE `consume_application_resume_token`.
That matches the comment in `RevertRevisionModal.tsx:57`.

## 2. What the token grants

The resume token itself grants nothing directly. It is exchanged, once, for the
application's `draft_token`, and that is the real credential. `draft_token` is
long-lived, never rotated, and is what sits in `localStorage` under
`supertransport_draft_token`.

With a `draft_token` the holder can:

- **Read** — `get_application_by_draft_token(uuid)`, `SECURITY DEFINER`, executable by
  `anon`, returns `SETOF applications` — i.e. **every one of the 82 columns** of that
  one row, restricted only to `is_draft = true`. That includes `dob`, full address and
  address history, `cdl_number`, employment history, accident/violation history,
  `signature_image_url`, the document URLs, and `ssn_encrypted`.
- **Write** — `save_application_draft(uuid, jsonb)` overwrites the applicant's own
  fields, and `submit_application_draft` submits it. `save_application_draft` refuses if
  the row is already `is_draft = false` (`cannot_edit_submitted_application`).

On the encryption requirement: the SSN column is `ssn_encrypted` — the plaintext is not
in the row, and decryption goes through the separate `decrypt-ssn` function, which this
path does not call. So the build doc's encryption requirement does hold for what the
token reaches. Everything *else* on that row — DOB, CDL number, addresses, signature
image URL — is plaintext and fully readable. That is the exposure a wider reuse window
would widen.

Note also: `anon` has **no** direct SELECT on `applications`; all of this flows through
the two DEFINER functions.

## 3. Why it is burned so easily

Path, from the emailed link:

1. Email links to `https://mysupertransport.lovable.app/apply?resume=<token>` (confirmed
   from `email_send_log.metadata.resume_url`).
2. `/apply` mounts `ApplicationForm`. In the mount effect (`ApplicationForm.tsx:202`), if
   `?resume` is present it **immediately** invokes `consume-application-resume`.
3. Only in the `.then()` — *after* the round trip — is `?resume` stripped
   (`:210-212`) and `draft_token` written to `localStorage` (`:227`), then the draft is
   loaded.

So the ordering is: consume -> respond -> strip param -> write localStorage. Every
window before the response lands is a window in which the token is spent and the browser
has kept nothing.

Consuming paths:

- **Initial load** — consumes. Intended.
- **Refresh immediately after a successful load** — the URL has already been rewritten by
  `setSearchParams(..., { replace: true })`, so a refresh reloads `/apply` *without*
  `?resume` and falls through to the `localStorage` branch at `:233`. **Not** locked out,
  provided localStorage survived. If the applicant is in a private window, has storage
  cleared on close, or is on an iOS browser that evicts it, the fallback is gone and the
  original link — which their email still shows — now fails.
- **Back-navigation** to the pre-strip history entry: because the strip uses `replace`,
  the `?resume` entry is replaced rather than pushed, so ordinary Back does not re-hit it.
  But a re-tap of the *email link* does, and that is what an applicant naturally does.
- **A second tap on the link** — always fails. This is the single most likely cause of the
  reported symptom.
- **Prefetch / link scanning** — yes, and this is the serious one. The endpoint is a POST
  to an edge function, so a plain `GET` prefetch of the URL does not by itself consume.
  But a scanner or preview bot that *renders* the page (Outlook Safe Links rendering,
  some mobile mail previews, corporate URL detonation) executes the mount effect and
  burns the token with no human present. `consume-application-resume` has
  `verify_jwt = false` and applies no rate limit, no bot check, and no user-gesture
  requirement.

Supporting evidence from the data: **30 of 38** used tokens were consumed within two
minutes of being created, and **22** tokens were superseded by a later token for the same
email — the pattern of an applicant repeatedly asking for a new link because the previous
one stopped working.

**Plainly stated:** a user who refreshes immediately after a successful load is *usually*
fine, because localStorage carries them. A user who taps the email link a second time —
or whose mail client rendered it first — is locked out, and the message they get sends
them back to the home page to request yet another link.

## 4. What happens to the applicant now

- The applicant sees a dead end with a hint: *"This resume link has already been used.
  Request a new one from the home page if needed."* (`ApplicationForm.tsx:221`). There is
  no in-page retry, no email box, no link to the resume dialog — they must find
  `/welcome` themselves and use the "Pick up where you left off" dialog
  (`ResumeApplicationDialog`), which is rate-limited to 3 requests per email per hour.
- **Staff can reissue.** `EmailLogPanel.tsx:442` exposes a resend that calls
  `resend-application-link`, minting a fresh token (24h–7d) without bumping the revision
  count. So there is a UI, not only a database write — but it is in a management panel,
  not surfaced to the applicant.
- Old tokens are never invalidated when a new one is issued, except deliberately via
  `RevertRevisionModal`, which uses `count_unused_resume_tokens` and invalidates unused
  links on revert.

Counts, from live queries:

- `application_resume_tokens`: **50** rows total; **38** have `used_at` set; **0** are
  currently both unused and unexpired.
- Applications still `is_draft = true` that have at least one used token: **7** distinct
  applicants (15 token rows). Their stalled steps: step 1, step 3 (x2), step 7 (x2), step 9.
- Of the applicants with a used token, those who later completed by another route:
  `emmafmueller@gmail.com`, `melindanshawn@yahoo.com`, `onmysooie@gmail.com`,
  `mcfoyronald@gmail.com` (approved) and `j.martinez4022@yahoo.com` (denied) — all
  submitted, i.e. they got through, generally after several tokens. The seven above did
  not.
- **67** draft applications are open overall.

The eight rejections you cite (15:57–22:04) are consistent with the token rows for
`rmihelitch@gmail.com` — tokens issued 2026-09-01 17:05, 2026-09-01 18:57, 2026-09-02
17:41 and 2026-09-02 22:03, three of them consumed within a minute or so of issue, the
application still sitting at step 3. **I could not confirm the eight events directly:**
`consume-application-resume` returned no retrievable edge-function logs in this session,
so the count and exact timestamps come from your report, not from a query I ran.

## 5. The options, with their risks

Reported, not chosen.

**(a) Idempotent reuse window — accept the same token for N minutes after first use.**
Smallest change; fixes the second-tap and the scanner-prefetch case outright. Cost: for
N minutes, anyone who obtains the link (forwarded email, shared screenshot, mail-server
copy, corporate archive) gets the same `draft_token` the applicant got, and with it full
read/write on the row described in section 2. Device switching is unaffected within the
window and unchanged outside it. The exposure scales directly with N and with how noisy
the applicant's mailbox is.

**(b) Reissue a fresh token on each successful consumption** (return a new token, email or
embed it). Keeps single-use semantics. But it does not fix the failing case: the
applicant is holding the *email*, not the new token, so a second tap on the email still
fails. It also does nothing about a scanner burning the first token — the fresh one goes
somewhere the human never looks. Little gain for the reported symptom.

**(c) Session-bind on first use** — record a browser-generated nonce (or a cookie) at
consumption and allow reuse only from that browser. Reuse becomes safe for the original
device indefinitely, and a forwarded link is worth nothing to anyone else, which is
strictly better than (a) on exposure. What breaks: switching devices. The applicant who
starts on a phone and finishes on a laptop must request a new link — which is exactly
today's behaviour for that case, so it is not a regression, but it must be messaged.
A scanner that renders the page first would bind the token to the scanner and lock the
human out — worse than (a) unless combined with something in (d).

**(d) What the code makes natural, additionally:**

- **Require a human gesture.** Do not consume on mount. Render "Continue your
  application" and consume on click. Kills prefetch/scanner consumption entirely, costs
  one tap, and composes with any of the above. The mount effect at `:202-231` is the only
  place that would change.
- **Recoverable dead end.** On `token_used`, render the `ResumeApplicationDialog` inline
  with the email prefilled instead of a paragraph telling them to find the home page. No
  security change at all; turns a dead end into a 10-second recovery.
- **Reorder the function** so `used_at` is written only after the application row is
  successfully resolved, and stop burning the token on a request whose response never
  arrives. Narrow, but it removes one class of silent loss.
- **Invalidate superseded tokens** when a new one is issued for the same application. Not
  a fix for this symptom — it reduces the count of live links in inboxes, which matters
  more if (a) widens the window.

Nothing here is exclusive; (d)'s gesture requirement plus (a) with a short window, or
(c) plus the recoverable dead end, are the natural pairings.

## 6. What I could not establish

- The eight `token_used` responses themselves. Edge-function logs for
  `consume-application-resume` were not retrievable, so the burst is inferred from token
  rows and the email log, not observed.
- Whether any specific burn was a mail-client prefetch rather than a human. The function
  records no user agent, no IP, nothing but `used_at` — so prefetch and second-tap are
  indistinguishable in the data. That absence is itself worth noting.
- Whether the affected applicants abandoned or are still trying. Seven drafts sit with a
  used token; the app records no contact attempt after that point.

One incidental observation, not part of the brief: every resume email appears **twice**
in `email_send_log`, roughly 0.3–1.2s apart, with the same token in the URL. Whether that
is a duplicate send or a duplicate log row, I did not establish.

## CONTRADICTIONS WITH THE RECORD

None found. `docs/tms-build-status.md` and `docs/tms-wish-list.md` mention
`consume_application_resume_token` only in the DEFINER inventory and the grant-revocation
discussion, and the live catalog matches both: the function is `SECURITY DEFINER` with
`search_path` pinned to `public`, `anon` holds EXECUTE, and the table itself carries no
client-role grants — exactly as the record and the `RevertRevisionModal` comment state.
The build doc records nothing about resume-token reuse semantics, so there is nothing for
this behaviour to contradict.
