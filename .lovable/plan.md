
## Add RECRUITING_EMAIL constant and update invite-applicant

Small, precise change — two files, three line edits total.

### What "hardcoded" means here

`recruiting@mysupertransport.com` appears **twice** in `invite-applicant/index.ts`:
- Line 48 — passed to `emailFooter()` as the footer contact address
- Line 150 — used as the Resend `from:` sender address

Neither references the shared `_shared/email-layout.ts`. If the recruiting address ever changes, someone would have to hunt through the function file to find both instances rather than changing one line in the shared constants file.

### Changes

**`_shared/email-layout.ts`** — add one line after `ONBOARDING_EMAIL`:
```ts
export const RECRUITING_EMAIL = 'recruiting@mysupertransport.com';
```

**`invite-applicant/index.ts`** — two updates:
1. Import `RECRUITING_EMAIL` from the shared file (already imports `emailHeader`, `emailFooter` — just add to the import list)
2. Line 48: replace `'recruiting@mysupertransport.com'` → `RECRUITING_EMAIL`
3. Line 150: replace `'SUPERTRANSPORT Recruiting <recruiting@mysupertransport.com>'` → `` `SUPERTRANSPORT Recruiting <${RECRUITING_EMAIL}>` ``

### Files changed
1. `supabase/functions/_shared/email-layout.ts` — add `RECRUITING_EMAIL` constant
2. `supabase/functions/invite-applicant/index.ts` — import and use it in 2 places

Zero functional or visual changes. This is purely a maintainability improvement.
