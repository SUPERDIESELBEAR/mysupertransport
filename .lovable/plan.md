

## Pre-Publish Review

### Console Warnings (Low severity)
- **React `forwardRef` warning** in `ManagementPortal` — a component is being passed a `ref` it can't accept. Cosmetic only; no user-facing impact. Fix: wrap the offending child component with `React.forwardRef`.

### Security Findings (5 issues)

| # | Severity | Issue | Recommended Fix |
|---|----------|-------|-----------------|
| 1 | **ERROR** | **Applications with `user_id = NULL` are readable by anyone** — the SELECT RLS policy has `OR (user_id IS NULL)`, exposing SSNs, CDL numbers, DOB, etc. | Remove `OR (user_id IS NULL)` from the policy. Handle anonymous drafts via a secure token-based lookup instead. |
| 2 | **WARN** | **Operators can update ANY field on `onboarding_status`** — the "update own decal photos" policy has no column restriction, so an operator could set `mvr_ch_approval`, `pe_screening_result`, `fully_onboarded`, etc. | Restrict the UPDATE policy to only the columns operators should modify (decal photos, specific self-service fields), or use column-level privileges. |
| 3 | **WARN** | **Potential privilege escalation via `user_roles`** — INSERT policy relies on `has_role(auth.uid(), 'management')`, which itself reads `user_roles`. If any timing gap exists, a user could grant themselves roles. | Move role assignment to a `SECURITY DEFINER` function callable only by management, and remove the direct INSERT policy. |
| 4 | **WARN** | **Leaked password protection disabled** | Enable it via the auth settings (or the `enable-leaked-password-protection` edge function that already exists in the project). |
| 5 | **WARN** | **Extension in `public` schema** | Move extensions (likely `pgcrypto` or `uuid-ossp`) to the `extensions` schema. Low priority — no user-facing risk. |

### Linter (2 issues)
Same as findings #4 and #5 above — no additional issues.

### Network
No failing requests detected.

### Architecture
- Routing and auth gating look correct — role-based redirects are in place.
- Demo mode provider is properly positioned in the component tree.
- Edge functions have appropriate `verify_jwt = false` where needed.

---

### Recommended Priority Order

1. **Fix the applications SELECT RLS policy** (finding #1) — this is a data exposure error and should be fixed before publishing.
2. **Restrict operator UPDATE on `onboarding_status`** (finding #2) — prevents operators from self-approving onboarding steps.
3. **Harden `user_roles` INSERT** (finding #3) — move to a SECURITY DEFINER function.
4. **Enable leaked password protection** (finding #4) — quick toggle.
5. **Fix `forwardRef` console warning** — cosmetic cleanup.
6. **Move extensions from `public` schema** (finding #5) — lowest priority.

Would you like me to proceed with fixing these issues, starting with the critical ones (#1 and #2)?

