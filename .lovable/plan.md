# Plan

## 1. Add forwarding-safeguard callout to PEI emails

Insert a gold `callout` block near the top of each template (right after the intro paragraph, before the facts table) in:

- `supabase/functions/_shared/transactional-email-templates/pei-request-initial.tsx`
- `supabase/functions/_shared/transactional-email-templates/pei-request-follow-up.tsx`
- `supabase/functions/_shared/transactional-email-templates/pei-request-final-notice.tsx`

Wording (uses existing `callout` style from `_pei-shared.ts`):

> **Wrong recipient?** If PEI verifications are now handled by someone else at {employerName}, please forward this email to the correct person in your office. The applicant may have provided contact info that is several years old.

The follow-up template already has a similar one-liner in the footer ("If you're no longer the right contact…"); that footer line will be removed since the new callout supersedes it.

No logic, registry, or DB changes — text-only edits to three `.tsx` files.

## 2. Surface PEI Queue in Management Portal sidebar

Currently `PEIQueuePanel` is only mounted in **Staff Portal**. The user is on **Management Portal** (`/dashboard?view=…`) and has no entry point.

Edits to `src/pages/management/ManagementPortal.tsx`:

1. Add `'pei-queue'` to the `ManagementView` union and the runtime view-validator allow-list.
2. Import `PEIQueuePanel` from `@/components/pei/PEIQueuePanel`.
3. Add a nav item to `navItems` (placed under Applications, near Pipeline):
   ```
   { label: 'PEI Queue', icon: <Briefcase className="h-4 w-4" />, path: 'pei-queue' }
   ```
4. Add a render block:
   ```
   {view === 'pei-queue' && (
     <PEIQueuePanel onOpenApplication={(appId) => { /* open ApplicationReviewDrawer for appId */ }} />
   )}
   ```
   Reuse the existing application-drawer opener already used by the Applications view so clicking a row from the queue jumps straight into that applicant's PEI tab.

No changes to `StaffPortal` — the queue stays available there as well.

## Verification

- Open Management Portal → confirm new "PEI Queue" sidebar item → click → list of all pending/sent/follow-up/final-notice rows across every applicant renders.
- Click a row → application drawer opens on the PEI tab.
- Trigger preview of each of the 3 PEI templates from the queue's "Templates" button → confirm the forwarding callout shows at the top with the new copy and that the follow-up footer line is gone.
