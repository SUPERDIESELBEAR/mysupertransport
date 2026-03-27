

## Exclude Fully Onboarded Operators from the Applicant Pipeline

### Current behavior
The Pipeline Dashboard fetches **all** operators regardless of onboarding status. Fully onboarded operators get an "Onboarded" badge but remain in the list alongside in-progress operators. This creates clutter and confusion as the roster grows.

### Proposed change
Filter out operators where `fully_onboarded = true` from the pipeline view so only in-progress (not yet onboarded) operators appear. Once onboarded, operators are managed exclusively from the Driver Hub.

### Technical detail

**One file: `src/pages/staff/PipelineDashboard.tsx`**

In the `fetchOperators` function, after building the `OperatorRow[]` array (~line 1105–1140), add a filter to exclude rows where `fully_onboarded` is `true`. This removes them before they ever reach the UI, keeping counts, stage ribbons, and filters accurate.

Alternatively, add `.eq('onboarding_status.fully_onboarded', false)` to the Supabase query itself — but since `fully_onboarded` is on a joined table, the post-fetch filter is simpler and more reliable.

A small "Onboarded" count badge could optionally be shown at the top (e.g., "12 onboarded → Driver Hub") as a quick reference, but this is not required.

### No database or edge function changes needed.

