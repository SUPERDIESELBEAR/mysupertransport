

## Fix Contact Info Not Persisting for Non-Applicant Operators

### Problem
When Marcus Mueller's contact info is saved and you navigate away, the data disappears because:
1. **Email is never populated**: The synthesized fallback uses `app?.email` where `app` is null, so email is always empty.
2. **Most fields have no storage**: Only `phone` and `home_state` persist to the `profiles` table. Fields like email, street address, city, zip, and DOB are only held in local React state and lost on re-navigation.

### Solution
When saving contact info for a non-applicant operator, **create an application record** and link it to the operator. This gives all contact fields a real persistence target, and on subsequent loads the data loads normally through the existing `applications` join.

### Changes — `src/pages/staff/OperatorDetailPanel.tsx`

1. **Fix email in the synthesized fallback** (~line 958): Replace `app?.email ?? ''` with the operator's auth email. Since auth email isn't available client-side, fetch it from the profile or leave the email field editable but empty — the real fix comes from step 2.

2. **Update `handleContactSave`** (~line 2133): When `applicationData.id` is null, instead of only updating `profiles`, **insert a new `applications` row** with all the contact fields (phone, email, address, dob) and set `review_status: 'approved'`, `is_draft: false`. Then update `operators.application_id` to point to the new record. Finally, update local state so `applicationData.id` is now set and future saves go through the normal path.

3. **Update `profiles` in parallel**: Continue saving `phone` and `home_state` to `profiles` so PipelineDashboard fallback still works.

4. **Refresh local state**: After creating the application record, update `applicationData` with the new `id` so the component treats subsequent saves normally.

### File Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Create application record on first contact save for non-applicant operators; link it to operator; fix empty email in synthesized fallback |

