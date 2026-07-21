## Goal
Ensure long operator names always display in full in the Compliance Alerts list, and tighten other elements in the same panel so the grid still lines up cleanly with the headers.

## Scope
File: `src/components/inspection/ComplianceAlertsPanel.tsx` (header + row grid only). No data/logic changes.

## Changes

### 1. Operator name never truncates
- Remove `truncate` on the operator name span and let it wrap to a second line when needed.
- Change the name cell wrapper so wrapping is allowed: replace `flex-1 min-w-0 flex items-center gap-2` with `flex-1 min-w-[180px] flex flex-wrap items-center gap-x-2 gap-y-1`.
- Keep the inline "Never Renewed" chip, but let it drop to the next line naturally when the name is long instead of squeezing the name.

### 2. Tighten fixed columns so freed space goes to the operator column
Match header widths to row widths in both places:
- Doc-type badge: `w-[92px]` → `w-[76px]`.
- Expires: `w-[96px]` → `w-[88px]`.
- Status pill cell: `w-[110px]` → `w-[100px]`.
- Last Action: `w-[90px]` → `w-[84px]`.
- Last Reminded / Last Renewed: `w-[72px]` → `w-[68px]` each.
- Row gap: `gap-3` → `gap-2` on both the header row and data rows so columns pack tighter without touching.

### 3. Trim right-side action buttons
The three trailing buttons currently reserve room for text labels on `sm:` and up. Tighten them so the extra space benefits the operator column:
- Row buttons `Remind`, `Renew`, `Open →`: reduce `px-2` to `px-1.5` and shorten the visible label to just the icon on screens narrower than `lg` (hide the `<span>` label with `hidden lg:inline` instead of `hidden sm:inline`). Tooltips already carry the full meaning.
- Update the header spacer widths at the end of the header row (`w-[74px] w-[68px] w-[58px]`) to match the new compact button widths (approx `w-[52px] w-[52px] w-[46px]`) so the columns still align.

### 4. Consistency pass
- Verify the header grid template and each row use identical widths at each breakpoint after the edits.
- Confirm the sticky panel width behavior is unchanged (no new overflow introduced) by keeping all fixed cells `shrink-0` and letting only the operator cell flex.

## Out of scope
- No changes to filtering, sorting, data fetch, tooltips, or dialogs.
- No visual restyle of pills/colors beyond the width tweaks noted.
