

## Finish the Pipeline cleanup — actually remove the Dispatch & Docs columns

### What went wrong last round

The previous pass added the new pieces (Start Date column, notes preview, 📎 chip) but **left the old Dispatch and Docs column headers in place**, and the body cells fell out of alignment with their headers. Net result on screen: the table still looks essentially the same as before, just with one extra column tacked on — exactly the opposite of the cleanup you asked for.

Specifically, in `src/pages/staff/PipelineDashboard.tsx`:

- **`<th>` Docs** (line 2933–2966) — still present.
- **`<th>` Dispatch** (line 2967–2987) — still present.
- The old Docs `<td>` was **replaced** by an "Onboarded / In Progress / Alert" status badge (line 3319–3327) — neither requested nor in the plan, and now misaligned under the Docs header.
- The old Dispatch `<td>` is **gone**, leaving the Dispatch header floating with no body cell underneath it.
- `colSpan={11}` is wrong both ways (header count is 13, body count is 12).

### Fix — three precise edits

**1. Remove the Docs `<th>`** — lines 2933–2966 (the entire `<th>` block including its sort button and tooltip). The 📎 chip already lives next to the name and tooltips list the same doc breakdown.

**2. Remove the Dispatch `<th>`** — lines 2967–2987 (the entire `<th>` block including its tooltip). The toolbar dispatch filter chip + counters stay.

**3. Remove the orphaned status-badge `<td>`** — lines 3319–3327 (the `Onboarded / Alert / In Progress` cell that was inserted under the old Docs header). It was never in scope; "In Progress" universally is exactly the noise we agreed to drop. The `Onboarded` badge is already conveyed by the green Stage 6 node in the Progress Track and the 100% chip; the `Alert` state is already conveyed by the red MVR/CH badges in the name cell and the Compliance shield column.

After these three deletions, header `<th>` count = 11, body `<td>` count = 11, and the `colSpan={11}` on the empty/loading rows becomes correct.

### What stays (unchanged)

- ✅ Start Date column — already added correctly (lines 2988–3014 header + 3329–3344 cell).
- ✅ 📎 doc-count chip + notes preview under the name (lines 3202–3232).
- ✅ Sort key `'docs'` retained in code so existing sort state doesn't break (it just no longer has a header chip — fine, sorting by doc count was a niche use case anyway).
- ✅ Dispatch toolbar filter chip + Dispatched/Home/Truck Down counters.
- ✅ Anticipated Start Date editor in `OperatorDetailPanel.tsx` (already wired in last round).

### Files touched

- `src/pages/staff/PipelineDashboard.tsx` — three targeted deletions described above.

### Out of scope

- The "Starts this week / month / overdue" quick-filter chips. Pulling those in next can be a separate pass if you still want them after seeing the cleaner table.
- Any dispatch logic, compliance logic, or detail-panel changes — none needed.

