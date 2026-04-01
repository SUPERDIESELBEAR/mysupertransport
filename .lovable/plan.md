

## Show Contact Info for All Operators (Including Non-Applicants)

### Problem
The Contact Info card in the Operator Detail Panel only renders when `applicationData` is truthy (line 2078). This data comes from joining the `applications` table via `operators.application_id`. Marcus Mueller was added through the "Add Driver" flow, not through the application form, so he has no linked application record. This means `applicationData` is `null` and the entire Contact Info section is hidden.

### Solution
Fall back to `profiles` data when no application record exists, so Contact Info always appears.

### Changes — `src/pages/staff/OperatorDetailPanel.tsx`

1. **In `fetchOperatorDetail`** (~line 939): the profile query already fetches `first_name, last_name`. Expand it to also fetch `phone` and `home_state`.

2. **After setting `applicationData`** (~line 951): if `applicationData` is null, synthesize a minimal contact object from profile data + the operator's auth email so the Contact Info card still renders:
   ```ts
   if (!app) {
     setApplicationData({
       id: null,  // signals "no real application row"
       phone: profile?.phone ?? '',
       email: /* fetched from auth or profile */,
       address_state: profile?.home_state ?? '',
       // other address fields empty
     });
   }
   ```

3. **In `handleContactSave`** (~line 2101): when `applicationData.id` is null, save edits to the `profiles` table instead of `applications`. Update `profiles.phone` and `profiles.home_state` for the operator's `user_id`.

4. **No guard change needed at line 2078** — the synthesized object makes `applicationData` truthy, so the card renders automatically.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Expand profile fetch; synthesize contact data from profile when no application exists; save contact edits to profiles table for non-applicant operators |

