

## Quick View Layout for Fully Onboarded Drivers

### What changes

When `status.fully_onboarded` is true, the panel will render sections in a new streamlined order and collapse the onboarding stages into a single expandable "Onboarding History" section at the bottom.

### New layout order (Quick View)

| # | Section | Notes |
|---|---------|-------|
| 1 | Header | Unchanged — name, badges, action buttons |
| 2 | Compliance Alert Banner | Unchanged |
| 3 | Contact Info Card | Moved up from current position |
| 4 | Truck & Equipment Card | Moved up |
| 5 | Inspection Binder | Moved up from near-bottom |
| 6 | Pay Setup (Stage 8) | Moved up |
| 7 | Cert Expiry Timeline | Stays roughly same position |
| 8 | Dispatch History | Stays roughly same position |
| 9 | Internal Notes | Stays at bottom of content |
| 10 | Collapsed "Onboarding History" | New wrapper — contains: Completion Summary, Upfront Costs, Stages 1–7 grid, Sticky mini-bar. Collapsed by default with a toggle to expand. |

### Non-Quick View (pipeline operators)

No change — everything renders in the current order as-is.

### Implementation approach

**Single file:** `src/pages/staff/OperatorDetailPanel.tsx`

1. Add a `const isQuickView = !!status.fully_onboarded;` flag after the existing `isAlert` variable.

2. Add a `const [onboardingHistoryExpanded, setOnboardingHistoryExpanded] = useState(false);` state variable.

3. Restructure the JSX return block using conditional ordering:
   - When `isQuickView` is true, render sections in the Quick View order
   - The Top Completion Summary, Upfront Costs, Sticky mini-bar, and Stages 1–7 grid get wrapped in a collapsible "Onboarding History" card at position 10
   - The Status badges row and On Hold banner remain right after the header in both views
   - Hide the progress bar / stage dots sticky bar in Quick View (they live inside the Onboarding History section)

4. The "Onboarding History" wrapper will be a white card with a collapsible header showing "Onboarding History" with a chevron toggle, defaulting to collapsed. When expanded, it renders the completion summary, upfront costs, and all stage cards in their current form.

5. Dialogs/modals at the bottom of the component remain unchanged in both views.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add Quick View conditional layout with reordered sections and collapsed Onboarding History wrapper for fully onboarded drivers |

