

## Fix Email + State Display in Driver Hub

### Root Cause

1. **Email not showing**: The email *is* saved in the `applications` table, but the Driver Roster query omits `email` from its select list. Simple fix — add it to the query.

2. **State not showing**: When you added Johnathan as a pre-existing driver, the only "State" field available was **CDL State** (which saves to `cdl_state`). The Driver Roster displays `address_state`, which was never populated. The Add Driver form needs a "Home State" field that saves to `address_state`.

### Changes

**1. `src/components/drivers/DriverRoster.tsx`**
- Add `email` to the `applications` select on line 385:
  `applications (first_name, last_name, phone, email, address_state, cdl_expiration, medical_cert_expiration)`

**2. `src/components/drivers/AddDriverModal.tsx`**
- Add a `home_state` field to `INITIAL_FORM`
- Add a "Home State" dropdown in the form UI (in the basic info section, next to Phone/Unit)
- Save it as `address_state` in the `applications` insert

**3. `src/components/drivers/ArchivedDriversView.tsx`**
- Also add `email` to the `applications` select for consistency

**4. Backfill Johnathan's data**
- Use the new editable Contact Info section in the Operator Detail Panel to set his `address_state` (since it's already editable there). No migration needed.

### Files Changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | Add `email` to applications select |
| `src/components/drivers/ArchivedDriversView.tsx` | Add `email` to applications select |
| `src/components/drivers/AddDriverModal.tsx` | Add Home State field + save to `address_state` |

