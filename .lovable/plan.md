## Goal

Allow daily SUPERDRIVE install reminders to be sent to active drivers who have not yet installed the app (no `pwa_installed_at`). Combine an automatic daily job with a per-driver manual "Send install reminder" button in the Driver Hub.

## Changes

### 1. `notify-pwa-install` edge function — make daily-safe

Currently the function skips any operator who has *ever* received a `pwa_install` notification (one-shot). Update behavior:

- Always filter to operators where `pwa_installed_at IS NULL` (skip already-installed).
- Replace the "ever notified" check with a **24-hour cooldown**: skip if a `pwa_install` notification was sent to that user in the last 24 hours (covers both bulk and per-driver targeted sends).
- Accept a new optional `mode` field: `"manual"` (default) or `"cron"` — used only for logging.
- Keep existing per-`operator_id` targeting and email-with-install-instructions behavior.

### 2. New daily cron job

Add a `pg_cron` job (via the Supabase insert tool, per scheduled-jobs rules) that runs `notify-pwa-install` once per day at 14:00 UTC (≈ 9:00 AM US Central) with `body: { mode: "cron" }`. The 24h cooldown inside the function prevents duplicate sends if a manual push already happened that day.

### 3. Driver Hub — per-row "Send install reminder" action

In `src/components/drivers/DriverRoster.tsx`:

- For each driver row where `pwa_installed_at` is null, add a small icon button (Bell/Send icon) next to the existing phone-status icon, with tooltip "Send SUPERDRIVE install reminder".
- On click: `supabase.functions.invoke('notify-pwa-install', { body: { operator_id: driver.id } })`, show toast on success/cooldown-skip, and disable the button briefly.
- Hidden when `pwa_installed_at` is set (already installed).
- Respect demo-mode guard (`useDemoMode().guardDemo()`).

### 4. Management Overview — keep existing bulk button

The existing "Install Status" bulk send button in `ManagementPortal.tsx` keeps working as-is — it now benefits from the 24h cooldown logic instead of the permanent block, so it can be re-pushed daily. Update its toast wording slightly (`"... skipped (sent within last 24h or already installed)"`).

### 5. Memory

Add a short memory note under `mem://features/pwa-install-reminders` describing: daily cron + manual button, 24h cooldown via `notifications.pwa_install` lookup, target = active operators with `pwa_installed_at IS NULL`.

## Technical notes

- Cooldown query (in edge function):
  ```ts
  const { data: recent } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', op.user_id)
    .eq('type', 'pwa_install')
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  if (recent?.length) { skipped++; continue; }
  ```
- Operator filter adds `.is('pwa_installed_at', null)`.
- Cron SQL uses the existing project URL + anon key pattern already used by other cron jobs in this project.

## Out of scope

- No changes to PWA install detection, manifest, or install banner.
- No SMS/push channel — email + in-app only (matches current function).
