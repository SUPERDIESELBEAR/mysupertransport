# Expand Launch SUPERDRIVE to All Drivers

## Goal

Make the Launch SUPERDRIVE Invite dialog able to reach all fully-onboarded active drivers (currently 48), not just the 36 flagged "Pre-existing operator added directly". The 12 app-onboarded drivers must receive copy that fits their context (they already have working accounts), and the existing 36 pre-existing flow must keep working unchanged.

## Audience model

Three audience groups, derived at query time:

1. **Pre-existing** — `applications.reviewer_notes = 'Pre-existing operator added directly'`. Need full intro + password setup. (Current behavior.)
2. **App-onboarded** — fully onboarded through the app, no pre-existing flag. Already have a password and have signed in. Should get a feature-announcement email, **not** a "set your password" email.
3. **All eligible** — union of the two above, restricted to `operators.is_active = true` AND `onboarding_status.fully_onboarded = true`.

Drivers still mid-pipeline (not fully onboarded) and inactive operators stay excluded — same as today.

## UI changes — `LaunchSuperdriveDialog.tsx`

- Add an **Audience** segmented control above the existing template picker:
  - "Pre-existing only (36)" — current default, current query
  - "App-onboarded only (12)"
  - "All onboarded drivers (48)"
- Show a contextual info banner under the audience picker explaining what each group is and why the email copy will differ.
- Filter chips ("Never invited / All eligible / In cooldown") and search continue to work, scoped to the chosen audience.
- Template picker behavior:
  - Pre-existing audience: both templates available, default = "Inspection Binder intro" (unchanged).
  - App-onboarded audience: template picker is replaced by a single fixed "App-onboarded announcement" template (no password-setup language). No template choice — keeps it idiot-proof.
  - All-onboarded audience: dialog auto-routes each recipient to the correct template based on their group; picker is hidden, replaced by a one-line note: "Each driver gets the email that matches their account type."
- "Force resend" checkbox stays as-is.
- Selection counters and the "Select all never-invited" shortcut update to reflect the active audience.

## Query changes — `loadOperators`

Replace the single `.eq('applications.reviewer_notes', ...)` query with a query that fetches all fully-onboarded active operators, then tags each row with `audience: 'pre_existing' | 'app_onboarded'`:

- Join `operators` → `onboarding_status!inner(fully_onboarded)` → `applications`.
- Filter: `is_active = true`, `fully_onboarded = true`, has email.
- Derive audience from `applications.reviewer_notes`.
- Apply the dialog's audience filter client-side after fetch.
- Audit-log lookup for `superdrive_invite_sent` stays the same.

## New email template — app-onboarded announcement

New HTML builder in `launch-superdrive-invite/index.ts`: `buildAppOnboardedAnnouncementHtml(firstName, appUrl)`.

Tone and content:
- "Your SUPERDRIVE app just got a major upgrade" (no "welcome" / no "set your password").
- Highlight the new Inspection Binder feature specifically (matches current rollout).
- CTA button → `${APP_URL}/dashboard` (deep link into the app, not a recovery link).
- Optional secondary line: "Already signed in on this device? Just open SUPERDRIVE — your binder is in the side menu."
- No password-setup instructions, no "Add to Home Screen" block (they already installed it during onboarding; we can keep a small "Don't have it on your phone yet?" link to `/install`).

## Edge function changes — `launch-superdrive-invite/index.ts`

- Extend `EmailTemplate` type to `'binder' | 'full' | 'app_announcement'`.
- Add the new builder and register it in `SUBJECTS` and `TEMPLATE_LABELS`.
- For `app_announcement`: **skip** the `auth.admin.generateLink({ type: 'recovery' })` call entirely. The email links directly to `${APP_URL}/dashboard`. This is the key safety property — no password reset is generated for active accounts.
- Accept a new optional body field `audience_routing: boolean`. When true, the function looks up each operator's `applications.reviewer_notes` and chooses the template per-recipient: pre-existing → caller's chosen template (`binder`/`full`); app-onboarded → `app_announcement`. When false, the function uses the single template for everyone (back-compat with current callers).
- The 30-day cooldown via `audit_log` continues to apply to all templates uniformly. `forceResend` still bypasses it.
- Per-recipient `metadata.template` in the audit log records the actual template sent, so future analytics can distinguish the three streams.

## Safety guarantees

- App-onboarded drivers never get a password-recovery link — their email contains only a plain dashboard URL. Their existing password is untouched. (This is the main concern from the previous discussion.)
- Pre-existing flow is byte-for-byte unchanged when the audience picker stays on its default.
- The 30-day cooldown plus the explicit "Force resend" toggle remain the only way to re-mail anyone.
- Mid-pipeline applicants are still excluded (we only pull `fully_onboarded = true`).

## Out of scope

- No new database columns or migrations.
- No changes to `LaunchSuperdriveDialog`'s result-summary panel layout (just new counts flow through).
- No changes to who can open the dialog (still management/owner via existing role check).

## Files touched

- `src/components/management/LaunchSuperdriveDialog.tsx` — audience picker, query, template-routing UI, counters.
- `supabase/functions/launch-superdrive-invite/index.ts` — new template, new audience-routing branch, no recovery link for app-onboarded.
- `public/version.json` — bump.

## Technical details

- The query that drives the dialog will look like:
  ```ts
  .from('operators')
  .select(`
    id, user_id, is_active,
    onboarding_status!inner(fully_onboarded),
    applications(first_name, last_name, email, reviewer_notes)
  `)
  .eq('is_active', true)
  .eq('onboarding_status.fully_onboarded', true)
  ```
  Audience is derived in JS:
  ```ts
  const audience = app?.reviewer_notes === 'Pre-existing operator added directly'
    ? 'pre_existing' : 'app_onboarded';
  ```
- Edge function audience-routing pseudocode inside the per-operator loop:
  ```ts
  let chosenTemplate = template;
  if (audience_routing) {
    chosenTemplate = (app?.reviewer_notes === 'Pre-existing operator added directly')
      ? template            // 'binder' | 'full' from caller
      : 'app_announcement';
  }
  const recoveryUrl = chosenTemplate === 'app_announcement'
    ? `${APP_URL}/dashboard`
    : (await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` }})).data.properties.action_link;
  ```

## Approval

Reply to approve and I'll implement.
