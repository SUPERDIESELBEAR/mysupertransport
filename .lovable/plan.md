

## Editable Contact Info + Birthday & Anniversary Features

### Part 1: Editable Contact Info in OperatorDetailPanel

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

Add a new "Contact Info" card below the header, above Stage 1, with an edit/save toggle:
- Phone (auto-formatted `(XXX) XXX-XXXX`)
- Email
- Street address, city, state, zip
- Birthday (from `applications.dob`, displayed with cake icon; celebratory badge if today)
- Anniversary (from `onboarding_status.go_live_date`, shows years of service; celebratory badge if today)

Edit mode: pencil icon toggles inputs. Save writes to `applications` table (phone, email, address fields, dob). Anniversary is read-only (derived from go_live_date).

### Part 2: Daily Birthday & Anniversary Edge Function

**New file: `supabase/functions/send-birthday-anniversary/index.ts`**

Runs daily via `pg_cron` at 9 AM UTC. Logic:
1. Query active operators where `applications.dob` month/day matches today OR `onboarding_status.go_live_date` month/day matches today
2. For each match, check `notification_preferences` for `birthday_anniversary` event type
3. Send personalized **email** via Resend (hardcoded template using `email-layout.ts`)
4. Insert **in-app notification** so the operator sees it in their portal
5. No SMS for now (can add Twilio later)

Birthday email: warm "Happy Birthday from the SUPERTRANSPORT family" message.
Anniversary email: "Congratulations on X year(s) with SUPERTRANSPORT" message.

### Part 3: Database — Schedule the Cron Job

**Via SQL insert** (not migration, contains project-specific URLs):
- Enable `pg_cron` and `pg_net` extensions
- Schedule `cron.schedule` to call `send-birthday-anniversary` daily at 9 AM UTC

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add editable Contact Info section with birthday + anniversary display |
| `supabase/functions/send-birthday-anniversary/index.ts` | New edge function with hardcoded greeting templates |
| SQL insert | Schedule daily cron job at 9 AM UTC |

