
## Two copy edits to the approval email

**File:** `supabase/functions/send-notification/index.ts` — lines 314 and 316 only.

### Change 1 — Heading emoji (line 314)
- Current: `'🎉 Congratulations — You\'ve Been Approved!'`
- New: `'👍 Congratulations — You\'ve Been Approved!'`

### Change 2 — Body copy brand name (line 316)
- Current: `…with <strong>SUPERTRANSPORT LLC</strong> has been…`
- New: `…with <strong>SUPERTRANSPORT</strong> has been…`

No database changes, no other files touched. Edge function redeploys automatically.
