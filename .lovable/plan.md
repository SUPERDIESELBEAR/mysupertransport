## Problem

Larry Bazin was deactivated (`operators.is_active = false`), but staff/managers are still receiving expiry alert emails about his inspection binder documents.

Root cause: the two scheduled expiry-check edge functions fetch every row from `operators` with no `is_active` filter, so deactivated operators continue to generate alerts forever.

## Fix

Add `.eq('is_active', true)` to the operator query in both jobs:

1. **`supabase/functions/check-inspection-expiry/index.ts`** (line ~108) — filter the operators select so the per-driver inspection binder loop skips deactivated drivers.
2. **`supabase/functions/check-cert-expiry/index.ts`** (line ~42) — same filter so CDL / medical cert expiry alerts are also suppressed for deactivated drivers.

No schema changes, no UI changes, no template changes. Existing already-queued/sent emails are not affected; from the next scheduled run forward, Larry (and any other deactivated operator) will be excluded.

## Out of scope

- Cleaning up Larry's binder/doc rows (kept for historical record).
- Any change to in-app notifications or the `notify-pwa-install` job (already scoped separately).
- Any change to manual "Send reminder" buttons in staff UI (those are explicit staff actions).
