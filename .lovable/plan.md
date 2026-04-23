

## Applicant Pipeline — add Start Date + inline Notes, drop Dispatch & Docs columns

### My take on each idea

| Idea | Verdict | Why |
|---|---|---|
| **Add "Anticipated Start Date" column** | ✅ Do it | Real planning value — gives staff a forecast view of when each applicant should be road-ready. |
| **Add inline "Notes" preview under the name** | ✅ Do it | We already have `operators.notes` (edited from the Operator Detail Panel). Just surfacing it in the row — no new field needed. Hidden when empty, so no clutter. |
| **Remove "Dispatch" column** | ✅ Agreed | The Pipeline is fundamentally an *onboarding* view. Dispatch state belongs to drivers already on the road, which now have the Driver Hub + Vehicle Hub. The column is also redundant with the per-status badges shown in the header (Dispatched / Home / Truck Down counts) and the dispatch filter chip. |
| **Remove "Docs" column** | ✅ Agreed — but with a small replacement | You're right that "In Progress" is near-universal noise. **However**, the column does double as a sort key for "who has uploaded the most." I suggest replacing it with a tiny **doc count chip next to the name** (e.g. `📎 7`) shown only when count > 0 — same info, far less width. Sortable via the column-header `⌥` menu we already have for `%`. |

### What changes

**1. Anticipated Start Date column (new)**
- New nullable column `operators.anticipated_start_date date`.
- New table column header **"Start Date"** between *State* and *Progress Track*, hidden on `md` (visible `lg+`), sortable.
- Cell renders the date using the project's `DateInput` component for inline edit (US Central, noon-anchored per memory rules) with a click-to-add chip when empty.
- Color cues: amber if date is in the past and operator isn't fully onboarded; muted-foreground otherwise.
- Filter pill row gets a new "Starts this week / this month / overdue" quick filter (matches the existing chip pattern).

**2. Inline notes under the name**
- Reuses existing `operators.notes` (no schema change).
- Displays as a small italic muted line right under the name and any "Invite Pending" chip:
  ```
  John Smith   45%   📎 7
  Note: Waiting on truck title — promised by Friday
  ```
- Truncated to ~80 chars with full text in a Tooltip; only renders when `notes` is non-empty.
- Editable from the existing Operator Detail Panel (already wired) — no new edit UI in the table.
- Pulled into the Pipeline `select` query (`notes` field added to the `operators` select).

**3. Remove Dispatch column**
- Drop the `<th>` header and the `<td>` body cell.
- **Keep** the dispatch *filter chip* and the *dispatched/home counters* in the toolbar — still useful for staff who want to slice the list. They just don't need the column.
- `colSpan` on loading/empty rows reduced accordingly.

**4. Remove Docs column → replace with name-row chip**
- Drop the `<th>` and `<td>`.
- Add a tiny `📎 N` chip next to the `%` chip on the name cell when `doc_count > 0`. Tooltip lists the breakdown that the old column header showed.
- Sort key `'docs'` stays in the SortKey union — existing sort buttons and any persisted state continue to work; we'll wire one of the `%`-style header chips on the name column to expose it.

### Database

One migration:

```sql
ALTER TABLE public.operators
  ADD COLUMN anticipated_start_date date;
```

No RLS change (existing operator-row RLS covers it).

### Files touched

- `supabase/migrations/<new>.sql` — add column.
- `src/pages/staff/PipelineDashboard.tsx`
  - Add `notes` and `anticipated_start_date` to the `operators` select; add to `OperatorRow` type.
  - Remove Dispatch + Docs `<th>`/`<td>`; update `colSpan`.
  - Add Start Date `<th>`/`<td>` with inline `DateInput`, save handler that calls `update({ anticipated_start_date })`.
  - Add notes line + 📎 chip in the name cell.
  - Add Start Date sort key + quick-filter chips (this week / month / overdue).
- `src/pages/staff/OperatorDetailPanel.tsx` — add an **Anticipated Start Date** field in the same area as the operator notes so staff can edit it without leaving the panel.
- `src/integrations/supabase/types.ts` — auto-regenerated.

### What stays untouched

- Vehicle Hub, Driver Hub, Compliance views — no changes.
- Notes textarea + save flow in OperatorDetailPanel — already exists, just exposed in one more place.
- Dispatch tracking itself (active_dispatch table, dispatcher portal, banners) — unchanged.

### Out of scope

- Reminders / email automation tied to the Start Date (could be a follow-up — e.g. "30 days to start" alerts).
- Per-row inline notes editing in the Pipeline table (kept in the Detail Panel to avoid double edit surfaces).
- Touching the Management portal's Applicant Pipeline copy beyond what flows through the shared `PipelineDashboard` component (it's the same component, so it gets the changes automatically).

