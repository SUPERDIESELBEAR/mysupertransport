

## Hide drivers from Vehicle Hub until insurance is activated

### The signal we'll use

`onboarding_status.insurance_added_date` — set by staff when an operator is added to the company insurance policy (Stage 6). It's already the milestone the rest of the app uses to mark a driver as "active in the fleet" (it triggers `fully_onboarded`, drives Stage 6 completion, fires the "Added to insurance policy ✓" notification, etc.).

Once it's set, the operator legally can drive — that matches when they should appear in the Vehicle Hub.

### Change

In `src/components/fleet/FleetRoster.tsx`:

1. Pull `insurance_added_date` in the `onboarding_status` select (line 57).
2. Filter out any operator where `insurance_added_date` is null when building the **Active** rows.
3. **Deactivated** tab is unchanged — once an operator was on the road, we still want to see them in history if they're later deactivated, regardless of insurance state.

That's the entire fix — no new tables, no migration, no triggers.

### What staff will see

- **Active tab** → only operators who are on the insurance policy. Empty truck-info rows from drivers who haven't reached Stage 6 disappear automatically.
- **Deactivated tab** → unchanged.
- **Pipeline / Driver Hub / Onboarding views** → unchanged. Pre-insurance drivers continue to show everywhere they did before; they just don't clutter the Vehicle Hub.
- The Vehicle Hub becomes a true "trucks on the road" view.

### Edge cases

- **Driver already in Vehicle Hub but insurance hasn't been backdated** → won't appear until staff sets the insurance date in the Operator Detail Panel (Stage 6). This is the intended behavior; it's also the existing path staff already use.
- **DOT inspections that exist for a pre-insurance driver** (from the recent backfill) → the records stay in `truck_dot_inspections`; they just don't render in the Vehicle Hub roster until insurance is activated. They re-appear automatically once the date is set.
- **"Add DOT Inspection" workflow** → unaffected. Staff can still add inspections via the Vehicle Hub for any active row that's now visible.

### Files touched

- `src/components/fleet/FleetRoster.tsx` — add `insurance_added_date` to the select; filter active rows on it.

### Out of scope

- Adding an explicit "Pre-Insurance" tab (you'd see those drivers in the Pipeline/Driver Hub already; adding a third tab here would re-introduce the clutter we're removing).
- Changing what "active" means anywhere else (Driver Hub, Pipeline, Compliance views).
- Backfilling or modifying the DOT sync from the previous round.

