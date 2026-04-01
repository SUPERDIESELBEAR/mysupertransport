

## Show Phone and State for All Applicants in Pipeline

### Problem
The Pipeline Dashboard pulls **phone** and **home_state** exclusively from the `profiles` table. Operators who entered through the application form (Dominic Elek, Ronald Lockett, Davien Johnson) have their phone and state stored in the `applications` table (`phone`, `address_state`), but those values were never copied to `profiles`. Gene Allen and Marcus Mueller likely had their profiles populated manually or via the Add Driver flow.

### Fix
In `src/pages/staff/PipelineDashboard.tsx`, when building each operator row, fall back to the `applications` data when `profiles.phone` or `profiles.home_state` is empty.

### Changes

**`src/pages/staff/PipelineDashboard.tsx`**

1. The query already joins `applications` (used for email). Extract `phone` and `address_state` from the application record as well.
2. In the row-building logic (~line 1108-1109), change to:
   - `phone: profile.phone || appPhone || null`
   - `home_state: profile.home_state || appState || null`

   Where `appPhone` and `appState` are pulled from the joined `applications` record alongside the existing `appEmail`.

This is a two-line logic change — no DB migration needed, no new queries. The `applications` data is already fetched.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Fall back to `applications.phone` and `applications.address_state` when profile values are empty |

