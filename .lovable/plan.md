# Final Consolidation & UI Cleanup Plan

## What I Confirmed in the Database
- **Only ONE auth user exists** for you: `marcsmueller@gmail.com` → `7e356f94...`
- That auth user is already linked to operator `ee993ec0...` — the one with all 10 truck photos, 15 documents, and a fully-executed ICA. ✅
- The "duplicate" operator (`ec79e22f...`) is an **orphan** — its `user_id` (`5cca4f77...`) does not exist in `auth.users`. It was likely created by an earlier abandoned application flow.
- That orphan only has 2 stray documents and a draft ICA — nothing important.

## Step 1 — Database Cleanup (via insert tool)
1. **Delete the orphan operator** `ec79e22f...` and its application `566e9b11...` (cascades will clean up the 2 stray docs, draft ICA, onboarding_status row).
2. **Rename your real account** — update application `a364e0e6...`:
   - `email` → `marcsmueller@gmail.com` (currently `marcsmueller+test@gmail.com`)
   - `last_name` → `Mueller` (strip the "(Test)" suffix)
3. **Mark Stage 2 complete** — set `onboarding_status.truck_photos = 'received'` for operator `ee993ec0...`. This also triggers the existing `notify_operator_on_status_change` flow.

## Step 2 — UI Banner Logic (`src/pages/operator/OperatorPortal.tsx`)
Update the "Documents Requested — Upload Required" banner so it ignores any document type that has already met its upload threshold:

```typescript
const DOC_THRESHOLDS: Record<string, number> = {
  truck_photos: 10,
  // others default to 1
};

const requestedButMissing = REQUESTABLE_DOC_TYPES.filter(key => {
  if (onboardingStatus[key] !== 'requested') return false;
  const have = uploadedDocs.filter(d => d.document_type === key).length;
  const need = DOC_THRESHOLDS[key] ?? 1;
  return have < need;
});

// Hide entire banner if list is empty
```

## Step 3 — Status Badge Polish (`src/components/operator/OperatorDocumentUpload.tsx`)
Replace the generic "Pending Review" badge for truck photos once 10/10 are uploaded:
- `0/10` → "Not Started" (gray)
- `1–9/10` → "X of 10 uploaded" (gold)
- `10/10` and status = `requested` → "Awaiting coordinator review ✓" (gold)
- status = `received` → "Reviewed" (green)

## Step 4 — Update Test-Operator Edge Function (`supabase/functions/create-test-operator/index.ts`)
Change `testEmail` constant from `marcsmueller+test@gmail.com` back to `marcsmueller@gmail.com` so future test re-provisioning targets your single real account.

## Step 5 — Verification
After applying:
- Reload the Management Portal → only **one** Marcus Mueller card remains, labeled `marcsmueller@gmail.com`.
- Reload the Operator Portal on your phone → blue "Documents Requested" banner is gone, Stage 2 shows **Reviewed** in green, "Truck Photos" row says **Reviewed**.

## Files Changed
- `src/pages/operator/OperatorPortal.tsx` (banner filter)
- `src/components/operator/OperatorDocumentUpload.tsx` (badge logic)
- `supabase/functions/create-test-operator/index.ts` (test email)
- Database operations via insert tool (no migration needed — data only)

## Risk Notes
- Deleting the orphan operator is safe: it has no auth user, no executed contracts, no real photos.
- Flipping `truck_photos` to `received` will fire the milestone trigger and send you the "Stage 2 reviewed" notification — expected behavior.
- All UI changes are additive/refining; no breaking changes to other operators.

**Approve to execute all five steps.**