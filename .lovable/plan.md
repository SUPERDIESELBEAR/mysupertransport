## Driver App: landing, sticky banner, and back-button fixes

Three separate issues surfaced from testing. All live in `src/pages/operator/OperatorPortal.tsx` plus `src/components/operator/OnboardingChecklist.tsx`.

### 1. Fully-onboarded drivers still land on Progress

Current guard uses only `onboardingStatus.insurance_added_date` to decide "fully onboarded." Per the owner, the landing rule is strictly:

- **100% complete → land on Home**
- **Anything less than 100% → land on Progress** (even if Go Live or Insurance dates exist in isolation)

Fix in `OperatorPortal.tsx`:
- Replace `isFullyOnboarded = onboardingStatus.insurance_added_date != null` with a completion check derived from the same `stages[]` array already computed for the checklist: `isFullyOnboarded = stages.length > 0 && stages.every(s => s.status === 'complete')` (equivalent to `progressPct === 100`).
- Keep the `onboardingStatusLoaded` guard so we don't redirect before data resolves.
- Landing target stays: `isFullyOnboarded ? 'home' : 'progress'`.
- All other `isFullyOnboarded`-gated UI (Home tab visibility, "Welcome" banner, tile labels) automatically follows the new definition — no additional call sites need editing.

### 2. Sticky onboarding progress banner shows slivers above/below

The header is `h-16 md:h-20` plus `padding-top: env(safe-area-inset-top)`, but the banner is `sticky top-16 md:top-20` — it doesn't account for the safe-area inset, leaving a gap the height of the notch inset above the banner. The "sliver below" is the banner's own shadow edge over the page background.

Fix in `OnboardingChecklist.tsx`:
- Replace `sticky top-16 md:top-20` with a top offset that includes the safe-area inset, e.g. `style={{ top: 'calc(env(safe-area-inset-top) + var(--st-header-h))' }}` where `--st-header-h` is `4rem` on mobile and `5rem` at `md`.
- Remove `shadow-lg` from the sticky banner (header already provides the visual seam) so the banner reads as a continuous extension of the black header.
- Ensure the surrounding wrapper has `bg-surface-dark` behind the banner region to prevent any sub-pixel gap from revealing the page background.

### 3. Header back button is inconsistent (Settlement/My Truck broken; Resource Center works)

Root cause: `goBack` calls `navigate(-1)` against browser history. When the landing URL was set via `navigate(..., { replace: true })` (the empty-URL normalization), the previous history entry is often an unrelated page (`/dashboard`, auth callback, external referrer). `navigate(-1)` from Forecast or My Truck exits the portal, the empty-URL guard immediately re-normalizes to home/progress, and `inAppNavCount` decrements to 0 so the arrow disappears. Resource Center happens to work because most users reach it after a longer nav chain.

Fix — make the back button deterministic using an in-memory view stack instead of browser history:
- Add `viewStackRef: MutableRefObject<OperatorView[]>` inside `OperatorPortal`.
- In `navigateToView`, when not `options.replace`, push the current `view` onto the stack before writing the URL.
- `goBack` pops the stack and calls `navigateToView(previousView, { replace: true })` (replace avoids history bloat). If the stack is empty, fall back to the driver's home base: `isFullyOnboarded ? 'home' : 'progress'`.
- Arrow visibility: show whenever `viewStackRef.current.length > 0` OR the current view differs from the driver's home base. This guarantees the arrow never vanishes mid-flow and always leads somewhere sensible — either the previous screen or Home.
- Remove the redundant page-level `onBack` wiring on `SettlementForecast`/`FleetDetailDrawer`/`ICAAmendment` that routes back to `progress`; those should defer to the unified header arrow (keep the arrow-hidden `hideBack` on `FleetDetailDrawer`).

### Technical notes
- Files touched:
  - `src/pages/operator/OperatorPortal.tsx` — `isFullyOnboarded` recomputation, view-stack refactor of `goBack`/`navigateToView`, arrow-visibility condition.
  - `src/components/operator/OnboardingChecklist.tsx` — sticky banner top offset + shadow cleanup.
- No DB or edge-function changes.
- Preview mode (`isPreview`) keeps its existing `setPreviewViewState` path — the view stack lives in the same ref for both modes.
- Nav trace continues to log `tap`; add a `back-pop` event for observability.
