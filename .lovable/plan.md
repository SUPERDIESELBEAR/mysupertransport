

## Send Invite to Contact Email, Not Auth Email

### Problem
The `resend-invite` function now correctly uses the auth email (`marc@mysupertransport.com`) for `generateLink` — that's required because Supabase must match the auth account. But it also **delivers** the email to that same auth address. The user expects the invite to arrive at the contact email stored in the application (`marcsmueller@gmail.com`).

### Solution
Decouple the two emails in `supabase/functions/resend-invite/index.ts`:

1. **Keep `targetEmail`** (resolved from auth) for `generateLink` — this must match the auth account
2. **Use `normalizedEmail`** (from the application record) for the Resend `to:` field — this is where the operator actually checks email
3. Only fall back to `targetEmail` for delivery if the application email is empty

### Change

**`supabase/functions/resend-invite/index.ts`** — line 172: change `to: targetEmail` → `to: normalizedEmail || targetEmail`

This is a one-line change. The recovery link inside the email still works regardless of which inbox receives it.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/resend-invite/index.ts` | Send email to application email address, keep auth email for link generation |

