## Goal

When a staff/management user clicks **Open** on a row in the PEI Queue, the Application Review drawer should land on the **PEI** tab instead of the default **Overview** tab.

## Changes

1. **`src/components/management/ApplicationReviewDrawer.tsx`**
   - Add optional prop `initialTab?: 'overview' | 'documents' | 'pei'`.
   - Use it to initialize `activeTab` state (default `'overview'` — preserves current behavior everywhere else).

2. **`src/pages/staff/StaffPortal.tsx`**
   - Add a small state `reviewInitialTab` (default `'overview'`).
   - In the `PEIQueuePanel`'s `onOpenApplication` callback, set `reviewInitialTab = 'pei'` alongside `setReviewApp(...)`.
   - Pass `initialTab={reviewInitialTab}` into `<ApplicationReviewDrawer ... />`.
   - Reset `reviewInitialTab` to `'overview'` in the drawer's `onClose`.

3. **`src/pages/management/ManagementPortal.tsx`**
   - Same pattern: add `peiReviewTab` state, set it to `'pei'` from the PEI Queue callback, pass `initialTab` to the drawer, reset on close.

No other callers of `ApplicationReviewDrawer` change — Overview remains the default for Applications view, Driver Hub, and elsewhere.

## Verification

1. From **PEI Queue**, click **Open** on any row → drawer opens with the **PEI** tab active.
2. From the regular **Applications** list (or Driver Hub), open an application → drawer still opens on **Overview**.
3. Close and reopen from PEI Queue → still lands on PEI.
4. Close from PEI Queue and then open from Applications list → lands on Overview (state reset works).

## Out of scope

- No change to PEI Queue UI, data fetch, or tab content.
- No change to deep-link / URL routing.
