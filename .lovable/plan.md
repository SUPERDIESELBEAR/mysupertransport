

## Revised: Add Background Verification to Application Review

Same plan as previously approved, with the section renamed from **"Pre-Screening"** to **"Background Verification"** throughout to avoid confusion with the PE Screening (drug & alcohol test) step.

### Database changes
Add 3 columns to `public.applications`:

| Column | Type | Default |
|--------|------|---------|
| `mvr_status` | `mvr_status` enum | `'not_started'` |
| `ch_status` | `mvr_status` enum | `'not_started'` |
| `background_verification_notes` | `text` | `null` |

### UI changes — ApplicationReviewDrawer.tsx
1. Add a **"Background Verification"** section in the Overview tab with:
   - MVR Status dropdown (Not Started / Requested / Received)
   - Clearinghouse Status dropdown (Not Started / Requested / Received)
   - Background Verification Notes textarea
   - Save button
2. **Approve & Invite** button disabled until both MVR and CH are `received`

### Approval carry-forward — invite-operator/index.ts
- Initialize `onboarding_status.mvr_status` and `ch_status` from the application values
- If both are `received`, auto-set `mvr_ch_approval = 'approved'`

### Files changed
| File | Change |
|------|--------|
| Migration | Add 3 columns to `applications` |
| `ApplicationReviewDrawer.tsx` | Add Background Verification section; gate Approve button |
| `invite-operator/index.ts` | Carry forward MVR/CH statuses on approval |

