
## Investigation result

I found the real cause: Bobby’s **application record is correct**, but the UI is still pulling his display name from the **profile record**, which is still stored as `BOBBY THOMPSON`.

### What I verified
- `applications` table: Bobby is already saved as `Bobby Thompson`
- `profiles` table: Bobby is still saved as `BOBBY THOMPSON`

### Why the app still shows all caps
Several staff/driver views prefer `profiles.first_name` / `profiles.last_name` over the application name:
- `src/pages/staff/PipelineDashboard.tsx`
- `src/components/drivers/DriverRoster.tsx`
- `src/pages/staff/OperatorDetailPanel.tsx`

So even though the application was fixed, those screens still render the old profile casing.

## Recommended fix

### 1. Fix Bobby’s existing profile data
Update Bobby’s `profiles` row to `Bobby Thompson` so the current UI immediately displays correctly everywhere.

### 2. Make the UI prefer application names when available
Adjust name resolution so screens use:
1. application name first
2. profile name as fallback only if application name is missing

That keeps applicant/operator names consistent with the normalized application data.

### 3. Keep future data synchronized
When an operator is created/invited from an application, also update the related profile name from the application record so profile and application don’t drift apart.

## Files to update
- `src/pages/staff/PipelineDashboard.tsx`
  - Use `appRecord.first_name/last_name` before `profile.first_name/last_name`
- `src/components/drivers/DriverRoster.tsx`
  - Same fallback order: application first, profile second
- `src/pages/staff/OperatorDetailPanel.tsx`
  - Set `operatorName` from application name when present
- `supabase/functions/invite-operator/index.ts`
  - After resolving/creating the operator user, upsert/update the profile name from the application so future operators stay in sync

## Technical note
This is not a cache issue. It is a **data-source mismatch**:
```text
Application name = corrected
Profile name     = still old ALL CAPS
UI               = currently reading profile in key places
```

Once implemented, Bobby should display correctly and future normalized applications should stay visually consistent across Pipeline, Driver Hub, and operator detail views.
