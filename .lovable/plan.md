
# Confirm the trigger revoke, and account for the 133

## Part 1 — Prove the triggers still fire

The catalog says the triggers exist. It does not say they still do their work. The revoke touched 53 functions across 20+ tables, and if one is broken it fails at write time on a real row.

### 1.1 Exercise the write paths, and check the side effect — not the save

The failure mode to catch is a write that *appears* to succeed while its logging, syncing, or notifying silently stops. So each check is a pair: perform the action through the UI, then assert the row the trigger was supposed to produce.

Driven with Playwright against the local dev server, signed in as a **demo driver** and as **staff** (the demo sandbox exists precisely so this costs nothing real).

| Action through the app | Trigger under test | Side effect asserted |
| --- | --- | --- |
| Driver sends a message | `bump_thread_last_message`, `enforce_message_edit_rules` | `message_threads.last_message_at` advanced |
| Driver uploads a document | `notify_staff_on_docs_uploaded` | new `notifications` row |
| Driver certifies a RODS day | `enforce_rods_day_lock`, `enforce_rods_certified_continuity`, `enforce_rods_event_lock` | day certified; a second edit attempt is still refused |
| Staff changes onboarding stage | `notify_operator_on_status_change`, `copy_stage2_docs_to_vault`, `enforce_onboarding_status_self_update` | operator notification created |
| Staff sets dispatch status | `log_dispatch_status_change`, `sync_active_dispatch_from_log` | new `dispatch_status_history` row; `active_dispatch` matches |
| Staff edits an IRP expiry date | `sync_irp_expiry_to_mo_plate`, `log_inspection_expiry_change` | matching `mo_plates` row updated |
| Applicant submits an application | `sync_application_expiry_to_binder`, `update_application_pei_status` | binder/PEI status reflects it |
| Any notification created | `notifications_autofill_entity` | entity columns populated, not null |

The lock-enforcing triggers matter most: those *reject* writes. A broken one fails open and silently permits an edit to a certified log. Each is tested by attempting the write that should be refused and confirming it still is.

### 1.2 State the coverage gap as a gap

Two different assertions, reported as two different numbers, never merged into one reassuring sentence:

- **15 of 53 verified by side effect.** A real write produced the row the trigger owes.
- **53 of 53 verified as attached and enabled** (`tgenabled = 'O'`). This catches detachment and disabling. It cannot see a body that runs and does nothing.
- **The difference — ~38 functions — is untested.** That is the honest state, and the doc will say so in those words. The enabled-trigger check is a cheap tripwire, not coverage, and will not be written up as though it were.

### 1.3 Make it permanent

Add the enabled-trigger assertion to `definer-live-catalog.test.ts`, labelled in the test name as an attachment check so a future reader does not mistake it for behavioural coverage.

---

## Part 2 — The 133, by category

Every count below was re-derived in SQL. **The linter emits no object names** — 133 numbered warnings with identical descriptions — so the names are mine, from re-running each check against the catalog. Counts match per category, which is what makes the mapping trustworthy.

| # | Category | Count | Status |
| --- | --- | --- | --- |
| 0028 | Anon can execute SECURITY DEFINER | **59** | **Tracked** — exactly `KNOWN_ANON_EXECUTABLE`, max 59 |
| 0029 | Signed-in users can execute SECURITY DEFINER | **63** | **UNTRACKED** |
| 0008 | RLS enabled, no policy | 4 | Untracked |
| 0014 | Extension in public | 3 | Untracked (`pg_net`, `pg_trgm`, `vector`) |
| 0025 | Public bucket allows listing | 2 | Untracked (`avatars`, `service-logos`) |
| 0011 | Function search_path mutable | 1 | Untracked |
| — | Leaked password protection disabled | 1 | Known platform limitation |

### Two lists, two defect classes, neither a subset of the other

This gets its own headed section at the top of §8, because it is the thing a future reader will assume wrongly:

> Linter 0011 checks whether a `search_path` pin **exists**, not what it contains. All ~104 functions pinned to `public` alone are pinned, so the linter is silent on every one of them. The shrink-only pin list tracks a defect class the linter cannot see; the linter reports classes the pin list does not cover. Do not read a clean 0011 as evidence the pins are correct, and do not read the pin list as covering the linter's residue.

The single 0011 hit confirms the separation: it is `_app_correction_editable_columns()`, which is `SECURITY INVOKER` and therefore not an escalation shape at all.

### The real gap: 63 authenticated-executable definers

Largest untracked block, and the same defect as the anon set one role over. Composition: the 59 anon functions (anon grants came paired with authenticated) plus 4 that are authenticated-only —

```text
acknowledge_eld_sync_alert(uuid)
mark_operator_seen(boolean)
raise_eld_sync_alert(uuid, text, date, text)
update_pei_archive_category(uuid, text, text)
```

`definer-live-catalog.test.ts` checks `authenticated` **only for trigger functions**. For callables it checks `anon` alone, so all 63 could change without a guard noticing — the same blind spot that let the two trigger grants through. Fix: add `KNOWN_AUTHENTICATED_EXECUTABLE` (63 entries) with its own asserted shrink-only max, mirroring the anon list. Signed-in ≠ authorized; several of these are staff-only operations reachable with any driver's token, and triaging that is register work, not this turn's.

### The 4 RLS-no-policy tables: assert it, don't document it

`application_resume_tokens`, `document_short_links`, `message_notification_throttle` in `public`, plus `app_private.config`. RLS on with zero policies denies all non-owner access — but only while no client role holds a grant, and that is precisely the property that drifted out of band on the mail-queue functions after a migration had already set it correctly. A doc paragraph would record the same intention that already failed to hold.

So this becomes a test in `definer-live-catalog.test.ts`, stated as a general rule rather than a list of four:

> No table in any non-system schema with RLS enabled and zero policies may hold any privilege granted to `anon` or `authenticated`.

Written that way it also covers the fifth such table nobody has created yet. `app_private.config` holds the `ip_hash` salt, so it is the one where a silent grant does the most damage — and under this rule it is covered by construction rather than by having been remembered.

### The remaining 6

- **3 extensions in public** — platform-installed; recorded as accepted, by name.
- **2 public buckets** — `avatars` and `service-logos` are listable. Whether listing is acceptable for either is a judgment call I should not make silently; recorded as an open register item.
- **1 leaked password protection** — already recorded as a Lovable platform limitation.

### Deliverable

Extend §8 of `docs/eld-mail-queue-acl-2026-08-01.md` with the two-lists distinction up front, the category table, the trigger-verification results with the 15/53/38 split stated plainly, and register entries by name for every untracked category. The tracking rule: **a warning is tracked only if a shrink-only list with an asserted max accounts for it — otherwise it goes in the register by name.**

---

## Note on ordering

Part 1 runs first. If a trigger is broken, that is a live defect and everything else waits.
