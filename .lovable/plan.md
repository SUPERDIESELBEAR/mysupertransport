

## Update send-insurance-request Auth to getClaims Pattern

### Problem
The `send-insurance-request` edge function uses `getUser()` for authentication, which makes an extra network call to the auth server. Every other edge function in this project uses `getClaims(token)` — the project standard that reads identity directly from the JWT, making it faster and more reliable.

### Change

**`supabase/functions/send-insurance-request/index.ts`** — lines 124–134

Replace the `getUser()` auth block with the `getClaims(token)` pattern used across the project:

- Extract the Bearer token from the Authorization header
- Create a user-scoped Supabase client
- Call `getClaims(token)` to validate and extract `sub` (user ID)
- Use the extracted user ID for the role check (line 143)

This is a drop-in replacement — the rest of the function (role check, data fetching, email sending) stays exactly the same, just referencing the new `caller.id` variable.

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Replace `getUser()` with `getClaims(token)` auth pattern |

### No other changes needed
The role check, data queries, and email logic remain identical.

