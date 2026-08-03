# PEI Queue — filters that actually filter

Three confirmed problems on the Previous Employment Investigations page, plus the archive-filter question.

## What's wrong today

1. **Filters don't remove archived applicants.** The chips filter individual employer rows by status, but each applicant is then placed into a section by a separate rule that always sends archived applicants to Archive (Hired) / Archive (Not Hired). So picking "Completed" still shows three sections. The two archive sections are also configured to render even when they contain zero applicants.
2. **Sections don't open when a filter is applied.** Which sections start open is a fixed list — Completed and both Archive sections are hard-coded closed. Filtering never changes it, so you filter to Completed and see a collapsed bar.
3. **Expand all / Collapse all only reach the inner applicant rows**, never the section bars. If the section is collapsed the buttons appear to do nothing, which is why they only seem to work under "All".

## What to build

**Archive filters (recommended approach)**
Add two chips — `Archived (Hired)` and `Archived (Not Hired)` — after GFE, separated by a thin divider so it reads as a second group. Two chips rather than one because they mirror the two sections and the two stat tiles already on the page, and "hired vs not hired" is the distinction staff act on.

Chip behavior:
- `All` — unchanged: every section, archives included.
- `Pending` / `Sent` / `Overdue` / `Completed` / `GFE` — active queue only. Archived applicants are excluded entirely, so "Completed" shows exactly one section.
- `Archived (Hired)` / `Archived (Not Hired)` — only that one archive section.
- Each chip carries a live count of matching applicants and greys out at zero (the active chip stays clickable so you can always get back out).

**Sections follow the filter**
- Only sections with matches render. The "no archived applicants in this category" placeholder only shows under `All` or the matching archive chip.
- Whenever the filter or search changes, every section that has matches auto-expands. With one section left standing, it is open with its applicants listed. Manual collapse still works and sticks until the filter changes again.

**Expand all / Collapse all**
- Expand all: opens every visible section *and* every applicant group inside them.
- Collapse all: closes both.
- Labels reflect current state so the pair is never a no-op.

**Empty state**
Keep the existing "No requests match this filter" panel, and add a "Clear filter" button that returns to All.

## Technical notes

All changes live in `src/components/pei/PEIQueuePanel.tsx`.

- Extend the `filter` union with `archived_hired` and `archived_not_hired`.
- Move archive exclusion into `filteredRows`: non-archive filters drop rows with `pei_archived_at`; archive filters keep only rows with the matching `pei_archive_category`.
- Derive `visibleSections` from `bySection` plus the active filter instead of the static `showWhenEmpty` flag.
- Replace the `defaultOpen` seed for `openSections` with an effect keyed on `[filter, search]` that sets it to the sections with matches.
- `expandAll` / `collapseAll` write both `openSections` and `openGroups`.
- Chip counts come from the same predicate the list uses, so a chip's number always equals the applicants it shows.
- Stat tiles and CSV export are untouched.