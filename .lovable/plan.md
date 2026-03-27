

## Fix: Pre-existing Operators Landing in Pipeline

### Root Cause

Two problems combine to send pre-existing operators into the pipeline:

1. **The `invite-operator` edge function** creates the operator and inserts a blank `onboarding_status` row (all defaults: `fully_onboarded = null`). It does NOT know about the pre-existing flag, so it never sets `fully_onboarded = true`.

2. **The client-side code** in `AddDriverModal.tsx` tries to update `fully_onboarded = true` afterward, but this is a race — the operator already exists with incomplete status. If anything goes wrong (timing, RLS, network), the operator stays in the pipeline permanently.

3. **The pipeline query** shows ALL operators regardless of onboarded status, so even a brief gap means the operator appears there.

### Fix — Two changes

**1. Edge function (`supabase/functions/invite-operator/index.ts`)**

When `skip_invite` is true, the function should:
- Insert `onboarding_status` with `fully_onboarded: true` instead of defaults
- Create the `active_dispatch` row server-side
- Skip the "Application Approved" notification and approval email (these are irrelevant for pre-existing operators)

This makes it atomic — the operator is fully onboarded the moment they're created.

**2. Client-side cleanup (`src/components/drivers/AddDriverModal.tsx`)**

Remove the post-invite steps that redundantly set `fully_onboarded`, create `active_dispatch`, etc. for pre-existing operators, since the edge function now handles it. Keep the truck info ICA insert (which the edge function doesn't know about) and the unit number update.

### No database changes required.

