## PEI Tab Enhancements — Inline Editing + GFE + Queue Polish

### Goal
Let staff fix missing employer contact info (City, State, **Email**) directly inside the per-application PEI tab without bouncing to Step 3, document Good Faith Efforts from anywhere a request lives, and make the global PEI Queue more useful for triage.

### Architecture decision
- **Per-application PEI tab** = workspace (build, edit, send, GFE, view responses).
- **Global PEI Queue** (sidebar) = cross-applicant triage dashboard.
- No separate top-level PEI module page — would duplicate the queue and break the application-context workflow.

---

### 1. Inline employer editing (PEI tab)

In `src/components/pei/ApplicationPEITab.tsx`, each employer row gains an inline editable mini-form with three fields:
- **Email** (required to send a request)
- **City** (required)
- **State** (required, US_STATES dropdown)

Behavior:
- Fields render as compact inputs directly in the row when missing or when user clicks an "Edit contact info" pencil.
- "Save" writes back to `applications.employers` JSONB at the correct array index, then refetches.
- A row cannot be sent (Send button disabled with tooltip) until Email + City + State are populated.
- Email is validated with a basic regex before save; trimmed and lowercased.
- Title Case applied to City on save (matches existing data normalization rule).

### 2. Add `email` to employer schema

`EmployerRecord` in `src/components/application/types.ts` gets an optional `email: string` field (default `''`). Step 3 employment form gets an optional Email input per employer (not required at submission, but encouraged) so future applicants can supply it up-front. `utils.ts` validation leaves Email optional in Step 3 — it only becomes required at the PEI send step.

### 3. GFE access from both surfaces

`GFEModal` already exists. Wire it so it's launchable from:
- Each row in the per-application PEI tab (existing).
- Each row in the global `PEIQueuePanel` via a row action menu (new) — useful when triaging the queue without opening the application drawer.

Submitting GFE flips that request's status to `gfe_documented` and stores notes/attempts (existing RPC).

### 4. Queue polish (`PEIQueuePanel`)

Light additions only:
- Status filter chips: All / Sent / Overdue / Completed / GFE.
- Deadline column with relative countdown ("Due in 3 days", "Overdue 2 days") using the existing date helper (noon-anchored).
- "Open Application" link on each row that opens the `ApplicationReviewDrawer` to the PEI tab.

### 5. No backend schema changes
All work uses existing tables/RPCs. The only data write outside PEI tables is updating the `employers` JSONB array on `applications`, which staff already have RLS permission to do.

---

### Technical notes

- Employer JSONB update pattern: read current `employers` array → splice in the edited record at index → `update({ employers: newArray })` → throw on error (loud failure pattern from project memory).
- Inline edit state lives in the row component; uses the edit-guard `useEffect` sync pattern so a refetch doesn't clobber unsaved input.
- Email regex: simple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — server-side RPC already validates token, not email format.
- Deadline countdown uses `parseISO(date + 'T12:00:00')` per timezone policy.
- All new buttons/inputs use existing shadcn components and design tokens — no new colors.

### Files touched
- `src/components/application/types.ts` — add `email` to `EmployerRecord` + `defaultEmployer`.
- `src/components/application/Step3Employment.tsx` — optional Email input per employer.
- `src/components/pei/ApplicationPEITab.tsx` — inline edit row, send-gating, save handler.
- `src/components/pei/PEIQueuePanel.tsx` — filter chips, deadline countdown, GFE action, open-application link.
- (No new files, no migrations.)

### Out of scope (still deferred to Phase 4)
Real Resend email integration, pg_cron auto-GFE escalations, Step 8 Driver Rights Notice, pipeline gating on `pei_status`.
