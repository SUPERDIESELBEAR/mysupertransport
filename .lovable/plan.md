
## Goal
Apply the agreed email address strategy across all UI pages and backend functions, with the addition of using `onboarding@mysupertransport.com` for all operator-facing emails during the onboarding phase (post-approval).

## The Three-Address Strategy (Confirmed)
- `recruiting@mysupertransport.com` → applicants (pre-approval: application form, denial emails)
- `onboarding@mysupertransport.com` → active operators during onboarding (all milestone, cert, message, and dispatch emails to operators)
- `support@mysupertransport.com` → general "Questions?" footers and support contact links
- `dispatch@mysupertransport.com` → already correct in WelcomeOperator.tsx, no change needed

---

## Complete Change Map

### Backend Functions (6 changes across 5 files)

**`send-notification/index.ts`**

| Location | Current | Change To | Reason |
|---|---|---|---|
| Line 77 — email footer | `recruiting@` | `support@` | General footer shown to all recipients |
| Line 341 — denial email body | `recruiting@` | `recruiting@` | ✅ Keep — applicant being denied |
| Line 441 — onboarding milestone body inline contact | `recruiting@` | `onboarding@` | Operator is post-approval in onboarding |

**`send-cert-reminder/index.ts`**

| Location | Current | Change To | Reason |
|---|---|---|---|
| Line 38 — email footer | `recruiting@` | `support@` | General footer, operator is active |

**`check-cert-expiry/index.ts`**

| Location | Current | Change To | Reason |
|---|---|---|---|
| Line 40 — email footer | `recruiting@` | `support@` | General footer, operator is active |

**`invite-staff/index.ts`**

| Location | Current | Change To | Reason |
|---|---|---|---|
| Line 52 — email footer | `recruiting@` | `support@` | Staff invite, general support is appropriate |
| Line 209 — `from:` sender | `onboarding@resend.dev` | `onboarding@mysupertransport.com` | Fix sandbox sender bug |

**`resend-invite/index.ts`**

| Location | Current | Change To | Reason |
|---|---|---|---|
| Line 157 — `from:` sender | `onboarding@resend.dev` | `onboarding@mysupertransport.com` | Fix sandbox sender bug |

### UI Pages & Components (2 changes across 2 files)

**`src/components/operator/OperatorStatusPage.tsx` — line 659**
- Current: `recruiting@mysupertransport.com`
- Change to: `support@mysupertransport.com`
- Reason: This is shown to already-onboarded operators as a general contact, not pre-applicants

**`src/components/operator/OperatorResourcesAndFAQ.tsx` — line 234**
- Current: `recruiting@mysupertransport.com`
- Change to: `support@mysupertransport.com`
- Reason: General FAQ contact section for active operators

### Files Left Unchanged
- `src/pages/ApplicationForm.tsx` — two instances of `recruiting@` ✅ correct (applicant context)
- `src/pages/ApplicationStatus.tsx` — already noted to change `info@` → `recruiting@` (this is on the denial page for applicants)
- `src/pages/WelcomeOperator.tsx` — `dispatch@` ✅ already correct

---

## Summary of Net Changes
```text
Email footers updated:    4  (send-notification, send-cert-reminder, check-cert-expiry, invite-staff)
Inline body updated:      1  (send-notification onboarding milestone contact line)
Sender from: fixed:       2  (invite-staff, resend-invite — both from resend.dev → onboarding@)
UI contact links updated: 2  (OperatorStatusPage, OperatorResourcesAndFAQ → support@)
ApplicationStatus fix:    1  (info@ → recruiting@ on the denial page)
Files untouched:          3  (ApplicationForm ×2, WelcomeOperator)
```

All 5 edge functions that are modified will be redeployed automatically.
