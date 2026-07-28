## Goal

Add first-class **Demo driver accounts** to SUPERDRIVE: real, fully functional driver records flagged as demo, hidden from normal staff views, safe to write to, safe to email, and resettable to a chosen scenario. Use them for staff training, feature testing, and driver-side (PWA) walkthroughs.

Note this is different from the existing staff-side Demo Mode (read-only browsing of real data). That stays as-is. The new capability is the opposite: **real writes against fake drivers.**

Yes — all three reset behaviors are possible, and they compose. The plan implements one reset action with a scenario picker: **Blank / New applicant / Mid-onboarding / Fully live / Offboarding**, so "clean state", "seed presets", and "just make a new one" are all covered.

## 1. Flagging demo accounts

- Add `is_demo boolean not null default false` to `operators`, `applications`, and `profiles` (profiles so driver-side login and emails can be recognized without an operator join).
- Add `demo_owner_user_id` (which staff member created/owns the demo driver) and `demo_label` (e.g. "Training — Onboarding Stage 4") to `operators`.
- Only Management/Owner can set or clear `is_demo` (enforced by a trigger, same pattern as the existing column-whitelist triggers).

## 2. Visibility — hidden by default

- Global staff preference `show_demo_accounts` (localStorage, default off) exposed as a small **"Show demo accounts"** switch in the staff/management header, next to the existing Demo Mode toggle.
- When off, demo drivers are excluded from: Driver Roster, Onboarding Pipeline, Dispatch Board, Compliance Summary, Vehicle Hub, MO Plate Registry, Onboard Systems, PEI Queue, Messages recipient pickers, and all dashboard counts.
- When on, they appear everywhere with a purple **DEMO** badge and are still excluded from compliance/analytics metrics and from scheduled jobs (birthday emails, PWA reminders, PEI auto-cadence, cert reminders).
- Implementation: a shared `useShowDemo()` hook plus a `demoFilter()` query helper applied to the list surfaces above, and `and is_demo = false` added to the scheduled-job queries and the compliance view.

## 3. Email & notification safety

- All outbound email for a demo driver is **redirected to the acting staff member's address**, with subject prefixed `[DEMO]` and a banner line at the top of the body saying which demo driver it was for.
- Implemented centrally in `send-transactional-email` (and the OSAS / return-instructions / DOT-consultant / PEI senders that build their own recipients): resolve recipient → if the target is a demo profile, swap `to` for the caller's email and prefix the subject.
- If no acting staff email can be resolved (cron path), the send is skipped and logged instead.
- In-app notifications still generate normally so staff can demo the bell/history UI.

## 4. Creating a demo driver

New **"Create demo driver"** action in Management → Drivers:
- Generates a demo identity (name prefixed `DEMO`, a `+demo` alias on a staff-controlled domain, fake DOB/CDL/truck data).
- Creates the auth user with a staff-set password so it can actually be logged into on the phone for a PWA walkthrough, plus a "Copy login details" button.
- Optionally clones the shape of an existing driver's onboarding state (no real PII copied — names, SSN, DOB, documents and signatures are replaced with placeholders).

## 5. Reset with scenario presets

**"Reset demo driver"** action (Management/Owner only, confirm dialog) that wipes and re-seeds the driver to a chosen scenario:

| Scenario | Resulting state |
|---|---|
| Blank | Operator exists, no onboarding rows, nothing uploaded |
| New applicant | Submitted application awaiting review, PEI pending |
| Mid-onboarding | Stages 1–4 complete, docs approved, ICA in progress |
| Fully live | Go Live set, OSAS signed, dispatch active, plate assigned |
| Offboarding | Deactivation started, equipment return instructions sent |

Reset deletes the demo driver's documents, storage objects, onboarding status, dispatch history, OSAS sheets, ICA records, messages, and notifications, then re-inserts the preset rows. Guarded server-side to refuse any operator where `is_demo = false`.

## 6. Driver-side walkthrough

- Demo drivers log into the normal SUPERDRIVE PWA with their credentials — the experience is identical, so nothing extra is needed beyond a persistent purple **DEMO ACCOUNT** ribbon at the top of the driver portal so nobody confuses it with a live account.
- A "Demo drivers" panel in Management lists each demo account, its label, owner, current scenario, and quick actions: Reset, Copy login, Show/Hide, Delete.

## 7. Cleanup

- "Delete demo driver" fully removes the auth user, operator, application, storage folder, and all child rows — only permitted when `is_demo = true`.

## Technical notes

- Migration adds the three `is_demo` columns, `demo_owner_user_id`, `demo_label`, `demo_scenario`, plus a guard trigger and updated RLS/GRANTs.
- Two new edge functions: `provision-demo-driver` and `reset-demo-driver` (service-role, management-authorized via `getClaims`, both refuse non-demo operators).
- `v_compliance_items` and the cron-driven queries get `is_demo = false` predicates.
- Email redirection lands in one shared helper under `supabase/functions/_shared/` so every sender picks it up.
- Existing `useDemoMode` (read-only staff browsing) is untouched; the new toggle is named "Show demo accounts" to avoid confusion.
