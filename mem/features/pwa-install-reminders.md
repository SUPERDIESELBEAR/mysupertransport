---
name: PWA Install Reminders
description: Daily SUPERDRIVE install reminders — automatic cron + manual per-driver action with 24h cooldown
type: feature
---
- Edge function: `notify-pwa-install` filters active operators with `pwa_installed_at IS NULL`. Skips any user who received a `pwa_install` notification in the last 24h (cooldown).
- Daily cron job `daily-pwa-install-reminder` runs at 14:00 UTC (~9 AM US Central) calling the function with `{"mode":"cron"}`.
- Manual per-row "Send install reminder" button in `src/components/drivers/DriverRoster.tsx` shows next to driver name when `pwa_installed_at` is null. Calls function with `{ operator_id, mode: 'manual' }`.
- Bulk-send button still available in `ManagementPortal.tsx` Overview "App Install Status" card.
- Sends in-app notification + email. Messaging leads with Google Drive → SUPERDRIVE Roadside Inspection Binder migration warning (Drive binder will no longer be accessible).
- SMS channel was considered and deferred (no provider connected). Cadence remains daily until installed.
