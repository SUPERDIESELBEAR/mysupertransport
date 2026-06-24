## Resume: Medium block — perf + mobile UX batch

We've shipped a11y, tokenization, bug-fix, and a focused `as any` follow-up. Next on the Medium queue are **perf** and **mobile UX**. Both are narrow, low-risk, and verifiable in the live preview.

### Perf batch

1. **Route-level lazy splits in `src/App.tsx`** — every page is currently a static import, so the first paint pulls in `StaffPortal` + `ManagementPortal` + `PipelineDashboard` (~6.7k LOC) even for a logged-out applicant. Convert the heavy portals to `React.lazy` + a single `<Suspense fallback={…spinner…}>` wrapping `<Routes>`:
   - `StaffPortal`, `ManagementPortal`, `DispatchPortal`, `OperatorPortal`, `PipelineDashboard` (already imported inside StaffPortal — leave as-is).
   - Keep `LoginPage`, `SplashPage`, `ApplicationStatus`, `ApplicationForm` eager (entry points hit on cold start).
   - Re-use the existing centered gold-spinner block as the Suspense fallback so there's no visual change.

2. **`PipelineDashboard.tsx` lazy-load detail panel** — file is 3,804 LOC; the operator detail drawer is the bulk of it but only opens on row click. Wrap `OperatorDetailPanel` import in `React.lazy` + local `<Suspense>` (same fallback pattern). No behavior change, smaller initial chunk for the staff dashboard.

### Mobile UX batch

3. **`min-h-screen` → `min-h-dvh` on remaining pages** — the Critical pass missed:
   - `src/pages/NotFound.tsx:12`
   - `src/pages/ApplicationForm.tsx` (4 occurrences at lines 559, 588, 597, 636)
   - `src/pages/operator/OperatorPortal.tsx:906`
   - `src/pages/Unsubscribe.tsx:76`
   Pure className swap; eliminates iOS Safari URL-bar clipping on these screens.

4. **`OfflineBanner` safe-area inset** — banner sits at top of viewport on iOS PWAs. Add `pt-[env(safe-area-inset-top)]` so it doesn't hide behind the notch when the app is installed.

### Out of scope for this batch

- `from('table' as any)` cluster — needs Lovable Cloud type regeneration; separate follow-up.
- Splitting `PipelineDashboard.tsx` / `ManagementPortal.tsx` beyond lazy-loading — larger refactor, keep for later.
- Remaining Medium items (any unaddressed items in the original 17) — pick up after this batch is verified.

### Files I'll touch

- `src/App.tsx` (lazy imports + Suspense)
- `src/pages/staff/PipelineDashboard.tsx` (lazy OperatorDetailPanel)
- `src/pages/NotFound.tsx`, `src/pages/ApplicationForm.tsx`, `src/pages/operator/OperatorPortal.tsx`, `src/pages/Unsubscribe.tsx` (dvh)
- `src/components/OfflineBanner.tsx` (safe-area inset)

### How you'll verify

- DevTools → Network → throttled "Fast 3G", hard-reload `/login` — initial JS payload drops noticeably; portals load on navigation with the existing gold spinner.
- Open `/dashboard?view=staff` → click any pipeline row → brief spinner → detail drawer appears as before.
- Resize the preview to mobile (or use the device toggle): `/apply` step pages, `/404`, `/unsubscribe`, operator portal — bottom buttons no longer clip behind Safari URL bar.
- DevTools → Offline → amber banner now sits below the iOS status-bar area on installed PWAs.

Approve and I'll ship it in one batch.
