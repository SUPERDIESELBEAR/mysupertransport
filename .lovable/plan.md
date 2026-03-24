
## Clean Up Marcus Mueller's Test Data

### What's in the database right now

There is **one operator** — Marcus Mueller (that's you). No other operators need to be removed. The cleanup is resetting the test artifacts on your own record so you can walk through the full cycle fresh from the beginning.

### What will be cleared

| Table | What's there | Action |
|---|---|---|
| `onboarding_status` | `eld_serial_number = 'ELD-TEST1234'`, all other fields already null | Reset that field to null, leave the row (it must stay linked to your operator) |
| `operator_documents` | 1 file: `test-physical-damage-cert.pdf` (insurance_cert) | Delete the row |
| `messages` | 2 test send-verification messages | Delete both |
| `notifications` | 16 accumulated test/system notifications | Delete all |
| `audit_log` | 25 entries from all test activity | Delete all |
| `cert_reminders` | 1 test CDL reminder | Delete the row |

### What will NOT be touched

- Your `profiles` row and `user_roles` (management, onboarding_staff, dispatcher, operator) — preserved
- Your `operators` row — preserved (the operator record itself stays)
- The `onboarding_status` row stays — only the test ELD serial number is nulled out and all other fields are already at their clean defaults
- All configuration tables: `faq`, `services`, `message_templates`, `inspection_documents`, `driver_documents`

### Implementation

One database migration with the following SQL:

```sql
-- 1. Clear test ELD serial on Marcus's onboarding status
UPDATE public.onboarding_status
SET eld_serial_number = NULL
WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';

-- 2. Remove test operator document (insurance cert upload)
DELETE FROM public.operator_documents
WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';

-- 3. Clear test messages
DELETE FROM public.messages;

-- 4. Clear all notifications (all belong to Marcus)
DELETE FROM public.notifications;

-- 5. Clear audit log
DELETE FROM public.audit_log;

-- 6. Clear cert reminders
DELETE FROM public.cert_reminders;
```

After this, Marcus Mueller's operator record exists with a completely clean onboarding status — every field at its default — ready to walk through the full onboarding cycle from step one.

### Files changed
1. `supabase/migrations/` — one new migration with the cleanup SQL above
