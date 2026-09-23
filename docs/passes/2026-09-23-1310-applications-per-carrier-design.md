# Pass report — 2026-09-23 13:10 UTC

## Scope

Demo carrier, **stage 3 of 6 — DESIGN per-carrier applications and PEI.** Nothing was
built. Changes limited to `docs/tms-build-status.md`, `docs/tms-wish-list.md` and this
report. No migration, no code, no data change. **The full suite was deliberately skipped
— this is a documentation-only pass.** Typecheck not run for the same reason.

Read first: `docs/passes/2026-09-22-2105-demo-carrier-stage-1.md` Step 4; the 2026-09-13
decision that applications stay GLOBAL and the 2026-09-16 record of why it no longer
holds; `docs/passes/2026-09-23-1130-demo-carrier-stage-2.md`.

Owner decision (2026-09-23): **applications and the PEI family become per-carrier.**

### Three figures in the prompt differ from the live system

Not contradictions of the design, but recorded so the numbers in the plan are the live
ones:

- The prompt says "your 338 applications". Live `applications` holds **346** rows. 338
  was the 2026-09-13 count of *real* (non-demo, non-test) applications.
- **`pei_cadence_settings` is already per-carrier** — it carries `company_id`, a
  RESTRICT foreign key to `carrier_profile`, and the restrictive `tenant_isolation`
  policy. It is the one member of the family that needs nothing.
- `documents`, `driver_uploads` and `onboarding_status` already carry `company_id` too.
  The work is the **applications family proper and the PEI request/response family**.

---

## STEP 0 — the stage 2 record entry that pass omitted

Written into `docs/tms-build-status.md` under `2026-09-23 11:30 UTC — Demo carrier,
stage 2 of 6`, and into the owner follow-up list in `docs/tms-wish-list.md`, both citing
`docs/passes/2026-09-23-1130-demo-carrier-stage-2.md`.

---

## STEP 1 — the family, live

### Rows (live, this pass)

| Table | Rows | `company_id` | Policies |
|---|---|---|---|
| `applications` | 346 (77 drafts) | no | 7 |
| `application_invites` | 5 | no | 4 |
| `application_resume_tokens` | 56 (**0 unexpired**) | no | 0 — no client grant at all |
| `application_correction_requests` | 80 | no | 1 (staff read) |
| `application_correction_fields` | 137 | no | 1 (staff read) |
| `application_document_history` | 12 | no | 2 |
| `application_interview_notes` | 2 | no | 4 |
| `application_revision_attachments` | 1 | no | 3 |
| `pei_requests` | 144 (127 not completed) | no | 4 |
| `pei_responses` | 16 | no | 3 |
| `pei_accidents` | 1 | no | 3 |
| `pei_request_events` | 527 | no | 1 (staff read) |
| `pei_cadence_settings` | 1 | **yes** | 2 (incl. `tenant_isolation`) |
| `profiles` | 176 | no | 5 |

### Policies, verbatim

`applications`
- `Staff can view all applications` SELECT `is_staff(auth.uid())`
- `Staff can update applications` UPDATE USING `is_staff(auth.uid())`
- `Staff can insert applications` INSERT WITH CHECK `is_staff(auth.uid())`
- `Staff can delete applications` DELETE (authenticated) `is_staff(auth.uid())`
- `Owner can view own application` SELECT `auth.uid() = user_id`
- `Owner can update draft application` UPDATE USING `auth.uid() = user_id AND is_draft`
  WITH CHECK the same plus the eleven staff-only columns pinned to their initial values
- `Public can submit application with email` INSERT to **`anon`, `authenticated`** WITH
  CHECK `email IS NOT NULL AND email <> '' AND user_id IS NULL` plus the same eleven pins

`application_invites` — staff SELECT/INSERT/UPDATE on `is_staff(auth.uid())`, DELETE on
`has_role(auth.uid(),'management')`.
`application_correction_requests` / `application_correction_fields` — staff SELECT only;
every write is definer-mediated.
`application_document_history` — staff SELECT and INSERT.
`application_revision_attachments` — staff SELECT, INSERT (`uploaded_by = auth.uid()`),
DELETE.
`application_interview_notes` — read by onboarding_staff/management/owner; INSERT by the
author in those roles; UPDATE by the author or management/owner; DELETE by
management/owner.
`pei_requests` — staff SELECT/INSERT/UPDATE, management/owner DELETE.
`pei_responses`, `pei_accidents` — staff SELECT/INSERT, management/owner DELETE.
`pei_request_events` — staff SELECT.
`pei_cadence_settings` — role read for owner/management/onboarding_staff, plus restrictive
`tenant_isolation` on `company_id = (SELECT current_company_id())`.
`profiles` — `Users can view/update their own profile` on `auth.uid() = user_id`,
`Allow insert on signup` WITH CHECK `auth.uid() = user_id`, and
`Staff can view all profiles` / `Staff can update profiles` on `is_staff(auth.uid())`.

**Every one of the 30 staff policies above is `is_staff(auth.uid())` or a bare role test.
None mentions a carrier. That is the whole of the problem.**

### Foreign keys between them

`applications` is the root. `ON DELETE CASCADE` to it from
`application_correction_requests`, `application_document_history`,
`application_interview_notes`, `application_resume_tokens`,
`application_revision_attachments`, `pei_requests`.
`application_correction_fields → application_correction_requests` CASCADE.
`pei_responses → pei_requests` CASCADE, `pei_request_events → pei_requests` CASCADE,
`pei_accidents → pei_responses` CASCADE.
`operators.application_id → applications(id)` (no cascade — the bridge into the operator
world). `applications.user_id → auth.users` SET NULL, `reviewed_by → auth.users`.
`application_invites` stands alone: no FK to `applications`, but it does carry
`invited_by` and `invited_by_name`, i.e. **a sender who already belongs to a carrier.**

**Consequence for the design:** every child carrier can be derived from its parent. Only
`applications` and `application_invites` need a carrier decided from outside the family.

### Writers and readers

Definer functions (all `SECURITY DEFINER`): `save_application_draft`,
`submit_application_draft`, `get_application_by_draft_token`,
`is_valid_application_draft_token`, `check_application_email_taken`,
`consume_application_resume_token`, `count_unused_resume_tokens`,
`submit_application_correction`, `approve_application_correction`,
`reject_application_correction`, `cancel_application_correction`,
`get_application_correction_by_token`, `move_revisions_to_pending`,
`check_driver_eligibility`, `get_pei_queue`, `get_pei_request_for_response`,
`submit_pei_response` (two overloads), `add_pei_staff_note`, `archive_applicant_pei` (two
overloads), `restore_applicant_pei`, `update_pei_archive_category`,
`set_pei_request_auto_pause`, `log_pei_manual_send`.

Triggers: `complete_pei_request_on_response`, `update_application_pei_status`,
`sync_profile_contact_from_application`, `log_correction_request_event`,
`log_revision_attachment_upload`, `log_revision_attachment_delete`,
`handle_operator_deactivated`.

Edge functions: `invite-applicant`, `resend-application-link`,
`request-application-resume`, `consume-application-resume`,
`request-application-revisions`, `revert-application-revisions`,
`send-application-correction-email`, `request-document-retake`, `deny-application`,
`notify-application-moved-to-pending`, `generate-application-pdf`, `decrypt-ssn`,
`log-pei-event`, `pei-auto-cadence` (scheduled), `pei-release-fcra`,
`provision-demo-driver`, `provision-test-driver`, `create-test-operator`,
`reset-demo-driver`, `set-demo-flag`.

Screens: `PipelineDashboard`, `ApplicationReviewDrawer`, `StaffApplicationModal`,
`InterviewNotesPanel`, `CorrectionRequestStatusCard`, `DocumentHistoryList`,
`DocumentSlotRow`, `RevisionReplyAttachments`, `PendingInviteAcceptance`,
`ApplicationPEITab`, `PEIQueuePanel`, `PEIResponseViewer`, `AddPreviousEmployerModal`,
`PEICadenceSettingsCard`, `AddDriverModal`, `OperatorDetailPanel`, `ActivityLog`,
`ApplicationStatus`, `SubmitSSN`.

### The anonymous paths — which run with no session at all

All four run with **no session**, as the `anon` role:

1. **`/apply`** — `check_application_email_taken`, `is_valid_application_draft_token`,
   `get_application_by_draft_token`, `save_application_draft`, `submit_application_draft`
   are all EXECUTE-granted to `anon` (verified live). `anon` additionally holds a bare
   **INSERT grant on `applications`** and the matching `Public can submit application
   with email` policy — the legacy non-draft path. `anon` has **no SELECT** on any table
   in the family.
2. **`/apply/ssn`** (`SubmitSSN`) — same draft-token functions.
3. **the resume route** — the emailed link hits `/apply?resume=<token>`, the page calls
   the `consume-application-resume` edge function, which runs as service role and calls
   `consume_application_resume_token` (also anon-executable). `application_resume_tokens`
   has **no grant to `anon` or `authenticated`** — definer-only, correctly.
4. **`/pei/respond/:token`** — `get_pei_request_for_response` then `submit_pei_response`,
   both anon-executable. `/pei/release/:token` reads through the `pei-release-fcra`
   function. The previous employer never signs in.
   The correction route uses `get_application_correction_by_token` /
   `submit_application_correction`, also anon.

So the anonymous surface is **already almost entirely definer-mediated**. The single
exception is the direct `anon` INSERT grant on `applications`.

---

## STEP 2 — how does an anonymous applicant's record get a carrier?

Stated against the real code. **This is the owner's decision; a recommendation follows,
not a choice.**

**(a) A per-carrier apply link** — `/apply/<slug>` or `/apply?c=<token>`, the public page
resolving the carrier from it through a new anon-executable definer function returning
`{company_id, legal_name, usdot, mc, locality}`.
*Costs:* a slug (or token) column on `carrier_profile`; one new resolver; `ApplicationForm`
and `SubmitSSN` thread the carrier through; `save_application_draft` /
`submit_application_draft` take it and stamp it.
*What it also fixes:* `useCompanyIdentity` today reads `carrier_profile` and **silently
falls back to the hard-coded SUPERTRANSPORT constants for anonymous visitors, because
`anon` cannot select `carrier_profile`.* Every disclosure the applicant signs — FCRA,
drug-and-alcohol, the printed letterhead — therefore names SUPERTRANSPORT regardless of
carrier. Option (a) is the only option that fixes this.
*Breaks:* a bare `/apply` with no carrier must still do something — either resolve the
sole carrier while one exists (the stage-2 pattern) or refuse.

**(b) Invite-only for carrier B** — `application_invites` already carries `invited_by`, so
the sender's carrier is derivable. Stamp the invite at creation, carry it onto the
application.
*Costs:* smallest change of the four. *Breaks:* there is no walk-up path for carrier B at
all, and the invite tables and the draft-token flow must be joined up — today an invite
email leads to `/apply`, which does not know the invite. The applicant's disclosures still
print SUPERTRANSPORT's letterhead.

**(c) A default carrier for unattributed applications** — a flag on `carrier_profile`.
*Costs:* trivial. *Breaks:* with three carriers "default" is arbitrary, and it puts a
walk-up applicant's SSN in whichever carrier holds the flag. It is a safety net, not a
mechanism.

**(d) What the code suggests** — the draft token is already the carrier's natural carrier:
once `applications.company_id` is stamped, every later anonymous step (resume, SSN,
correction, PEI response, PDF) derives the carrier from the row, not from the URL. So
**the carrier only ever has to be decided once, at the first write.** That makes (a) and
(b) alternative answers to a single question, and (c) a fallback behind either.

**What the demo needs vs what a real customer needs.** The demo needs (b) only: the owner
hand-onboards demo drivers, so every application starts from a staff action inside the
demo carrier and the carrier is known. A real second customer needs (a): they will want
their own apply link, their own name on the disclosures, and walk-up applicants.

**Recommendation: (a), with (b) falling out of it for free and (c) as the sole-carrier
fallback only.** Reasons: it is the only option that removes the hard-coded letterhead,
which is a federal-disclosure problem and not merely a tenancy one; it makes the carrier
explicit at the first write, where option (d) shows the decision belongs; and (b) becomes
a link containing the inviter's carrier rather than a separate mechanism. The cost over
(b) is one column and one resolver function.

---

## STEP 3 — the resume token and the document links

- **Resume** — `consume_application_resume_token` returns the application's `draft_token`;
  the page then loads through `get_application_by_draft_token`, which returns the row. Once
  the row carries `company_id`, the resumed session knows its carrier with no change to
  the token. **The token itself needs no carrier column.**
- **Tokens in the wild:** live, `application_resume_tokens` holds **56 rows and zero
  unexpired** (`expires_at > now()` returns 0). **No token in the wild can break.** The 24h
  expiry means this stays true for any cutover done more than a day after the last issue.
- **Correction links** — `get_application_correction_by_token` resolves through
  `application_correction_requests → applications`; carrier derived, no change.
- **PEI response links** — `pei_requests.response_token` resolves through
  `pei_requests → applications`; carrier derived.
- **Document links** — signed storage URLs, unaffected by row policies. The separate
  storage-policy work (≈50 role-only policies) is stage 4/5, not this.

---

## STEP 4 — backfill and cutover

Counts to stamp with SUPERTRANSPORT (`6b54d0e6-…`): applications 346, invites 5,
correction requests 80, correction fields 137, document history 12, interview notes 2,
revision attachments 1, PEI requests 144, responses 16, accidents 1, events 527.
`application_resume_tokens` (56) and `pei_cadence_settings` (1) need nothing — the first
derives, the second already has it.

Order, one migration per step:

1. Add `company_id uuid REFERENCES carrier_profile(id) ON DELETE RESTRICT`, **nullable**,
   to `applications` and `application_invites` only.
2. Backfill both from the sole carrier — safe today because there is exactly one.
3. Add the column to the nine child tables **with a stamping trigger that derives it from
   the parent**, and backfill through the same join. Children never accept a carrier from
   a caller: deriving it makes a cross-carrier child unstorable.
4. Change the writers (definer functions and the two anonymous entry points) to stamp.
5. Replace the policies (Step 5) and add the restrictive `tenant_isolation` policy.
6. `NOT NULL` last, in its own migration, once every writer stamps and a count of NULLs
   returns zero.

**A half-finished application mid-flight** keeps working: the backfill (step 2) precedes
the writer change (step 4), so a draft created before the column existed is stamped by the
backfill, and a draft created between steps is stamped by step 2's re-run or by the
stamping default. The 77 live drafts are all SUPERTRANSPORT's.

**Can `company_id` be NOT NULL at the end?** On `applications`, yes — **if and only if the
owner picks option (a) or (b)**, because then the carrier is known at the first write. With
option (c) alone a NULL would mean "walk-up applicant, carrier not yet decided", which is a
row no policy can safely show to anyone; it would then need a staff action to assign, and
the column would stay nullable forever. That is the strongest argument against (c).

---

## STEP 5 — the policies after

Pattern, per table: keep the role test, add the carrier test, and add the standard
restrictive policy so the carrier test cannot be bypassed by a future permissive policy.

```
-- permissive, per command
USING (is_staff(auth.uid()) AND company_id = (SELECT current_company_id()))
-- plus, once per table
CREATE POLICY tenant_isolation ON <t> AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT current_company_id()))
  WITH CHECK (company_id = (SELECT current_company_id()));
```

Per table: `applications`, `application_invites`, `application_correction_requests`,
`application_correction_fields`, `application_document_history`,
`application_interview_notes`, `application_revision_attachments`, `pei_requests`,
`pei_responses`, `pei_accidents`, `pei_request_events` — as above, keeping each table's
existing role distinctions (interview notes stay onboarding/management/owner and
author-scoped; the management-only DELETEs stay management-only).

`applications` also keeps its two applicant-facing policies unchanged — `auth.uid() =
user_id` is already narrower than any carrier test.

**Anonymous access after the change, stated as narrowly as possible:**

- `/apply` first write — **route it through `submit_application_draft` /
  `save_application_draft` only, and REVOKE the `anon` INSERT grant on `applications`
  together with the `Public can submit application with email` policy.** The definer
  function then decides the carrier from the resolved link, which an anonymous caller
  cannot forge. This is the single anonymous *table* privilege in the family, and it can
  be closed entirely.
- `/apply` read-back, `/apply/ssn`, resume, correction, PEI response — already definer-only.
  **No anonymous table access is needed anywhere in the family after the revoke.**
- The new carrier resolver for option (a) is the only new anon-executable function, and it
  returns public identity fields only: legal name, USDOT, MC, locality.

---

## STEP 6 — what else moves with them

**`profiles` can follow; it must not be given a `company_id`.** Two reasons. An applicant
has a profile row from signup, before any application and before any carrier is known — a
NOT NULL carrier on `profiles` would be unfillable at exactly the moment the row is
created. And a person may legitimately exist at two carriers (a driver who leaves one and
joins another; staff at both during a demo); a single carrier column would force a
duplicate identity. The correct shape is **unchanged storage, scoped staff reads**: replace
`Staff can view all profiles` with a read that joins through `company_members` and
`operators` to the viewer's carrier, leaving the self-read untouched.

It can follow rather than ship in the same pass because after this design carrier B's staff
would see, of the whole applicant family, **nothing** — and `profiles` exposes names,
phones and emails, not applications or SSNs. It should still be the next item after, and
it is on the stage-1 decisions-owed list as item 2.

---

## STEP 7 — the build plan, in passes

**Pass 3a — the column and the backfill (no policy change).** Steps 1-3 above. Proof:
`applications` = 346 with 346 stamped and 0 NULL; each child table's stamped count equals
its row count; a cross-carrier child INSERT is refused by the stamping trigger inside a
raising transaction with a scratch carrier. **Unchanged-for-SUPERTRANSPORT proof:** the
pipeline screen loads the same counts as Marcus (owner), Mae (management) and the
onboarding-only login; one application opens in the review drawer; the PEI queue returns
the same 144.

**Pass 3b — the writers stamp.** Every definer function, edge function and screen listed in
Step 1 that inserts. Proof: a throwaway application created through each entry path carries
the carrier; the throwaway is removed and zero residue quoted.

**Pass 3c — the policies, and close the anonymous INSERT.** Step 5, including the revoke.
Proof: as staff of a scratch carrier inside a raising transaction, all eleven tables return
zero SUPERTRANSPORT rows; as Marcus/Mae/onboarding they return the live counts; an anon
INSERT on `applications` is refused; `/apply` still completes end to end.

**Pass 3d — the per-carrier apply link and the letterhead.** Only if the owner picks (a).
Proof: the resolved carrier's name and DOT appear on the disclosures for that carrier's
link, SUPERTRANSPORT's for SUPERTRANSPORT's; a bare `/apply` behaves as decided.

**Pass 3e — `NOT NULL`, and the tests.** Plus every fixture that reads the family by
assuming one carrier, named by USDOT 2309365 as stage 2 did for the tenancy file. Proof:
full suite green with a scratch carrier inserted inside a raising transaction.

**What would break SUPERTRANSPORT's live operation if the carrier were created today
without stage 3:** nothing mechanically — the family has no carrier filter, so it keeps
working. What breaks is confidentiality: carrier B's staff would read, edit and **delete**
SUPERTRANSPORT's 346 applications, its 144 PEI requests and the SSNs on them, from the day
the row exists.

---

## Files this pass authored

- `docs/passes/2026-09-23-1310-applications-per-carrier-design.md` (this report)
- `docs/tms-build-status.md` (stage 2 entry; stage 3 design entry)
- `docs/tms-wish-list.md` (stage 2 done; stage 3 designed, awaiting the Step 2 answer)

## Contradictions

Three figures differ from the prompt and are recorded at the top of this report: 346 live
applications (not 338), `pei_cadence_settings` already per-carrier, and `documents` /
`driver_uploads` / `onboarding_status` already carrying `company_id`. Nothing else in the
prompt contradicts the live system.
