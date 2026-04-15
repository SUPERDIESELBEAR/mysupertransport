

## Add "Jump to Bottom / Back to Top" Floating Button

### Overview
Add a floating action button that toggles between "Jump to Bottom" and "Back to Top" based on scroll position. This will appear on long scrollable pages like Applicant Pipeline, Compliance, Notifications, etc.

### Approach
Create a single reusable `ScrollJumpButton` component that:
- Shows a **down arrow** ("Jump to Bottom") when near the top of the page
- Switches to an **up arrow** ("Back to Top") once the user scrolls past ~300px
- Uses `window.scrollTo({ behavior: 'smooth' })` for smooth navigation
- Positioned as a fixed floating button in the bottom-right corner, styled with the brand gold accent

Then add it to the long-scroll pages: **PipelineDashboard**, **ManagementPortal** (which embeds Pipeline, Notifications, Compliance views), and **StaffPortal**.

### Files
| File | Change |
|------|--------|
| `src/components/ui/ScrollJumpButton.tsx` | **New** — Reusable floating scroll button component |
| `src/pages/staff/PipelineDashboard.tsx` | Add `<ScrollJumpButton />` |
| `src/pages/management/ManagementPortal.tsx` | Add `<ScrollJumpButton />` |
| `src/pages/staff/StaffPortal.tsx` | Add `<ScrollJumpButton />` |

### Component Details
- Listens to `window.onscroll` with a throttled handler
- Below 300px scroll: shows `ArrowDown` icon → scrolls to `document.body.scrollHeight`
- Above 300px scroll: shows `ArrowUp` icon → scrolls to top
- Fixed position `bottom-6 right-6`, semi-transparent background, appears/disappears with a fade transition
- Z-index set below modals but above page content

