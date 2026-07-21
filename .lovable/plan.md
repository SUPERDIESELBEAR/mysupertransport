## Goal
Confirm anniversary emails/notifications fire every year on each driver's Go Live date and change the wording so the year count is ordinal (1st, 2nd, 3rd, 10th…) instead of always saying "1 year".

## Current state (verified)
- `send-birthday-anniversary` edge function runs daily at 15:00 UTC via `pg_cron` job `send-birthday-anniversary-daily` and matches by month + day against `onboarding_status.go_live_date`, excluding the go-live year itself. Yearly recurrence already works — no scheduling change needed.
- Both the edge function and `src/lib/birthdayAnniversary/templates.ts` currently render the year count as `"1 year"` / `"N years"`.

## Changes
1. Add a small shared `ordinal(n)` helper (e.g. 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 21 → "21st"). Place it in `src/lib/birthdayAnniversary/templates.ts` and duplicate the same helper inline in the edge function (edge functions can't import from `src/`).
2. Update copy in:
   - `supabase/functions/send-birthday-anniversary/index.ts` — subject, heading, and body use `${ordinal(years)} anniversary` phrasing (e.g. "Congratulations on your 3rd anniversary with SUPERTRANSPORT! 🎉", "Today marks your 3rd anniversary since you became an active operator…"). Notification title/body updated to match.
   - `src/lib/birthdayAnniversary/templates.ts` `anniversaryDefaults` — same ordinal phrasing so the staff-triggered popup message mirrors the automated one.
3. Deploy the edge function.

## Notes
- Birthday copy is unchanged.
- No DB migration required.
