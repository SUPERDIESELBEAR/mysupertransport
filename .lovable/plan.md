## Goal

Add two dedicated dropdown filters to the Activity Log so staff can drill into entries by **Application** (applicant) and **Staff member** (actor), in addition to the existing Action and Date filters. Pairs naturally with the existing "Revision Reverted" action filter so you can answer "show me every revert Jane did against John Doe's application last week" in three clicks.

## Behavior

1. Two new dropdowns appear next to the Date Range button:
   - **Applicant** — searchable combobox of applications that appear in the audit log (entity_type = `application`). Shows applicant name + email.
   - **Staff member** — searchable combobox of distinct `actor_name` values seen in the log.
2. Both dropdowns default to "All". Selecting a value re-fetches and filters the list to matching rows only.
3. Selected filter chips render below the toolbar with an "x" to clear individually, plus a "Clear all" link when 2+ filters are active.
4. Filters compose with existing Action filter, Date Range, and free-text Search (AND semantics).
5. CSV export honors the active Applicant + Staff filters and includes them in the filename suffix.
6. Empty state copy updates to mention the active applicant/staff filters when set.

## Implementation

### 1. `ActivityLog.tsx` — state & fetch
- Add `applicantId: string | null` and `actorId: string | null` to component state.
- Pass them into `fetchLog(...)` and the deps of the refetch effect.
- Update the RPC call: add `p_entity_id` (when applicant set, also pin `p_entity_type='application'`) and `p_actor_id`. If the RPC doesn't yet accept these, post-filter client-side as a fallback so the UI ships immediately, and note the RPC enhancement as a follow-up.

### 2. Option sources
- **Applicants**: `select id, first_name, last_name, email from applications order by last_name` (cap 500). Render as `Last, First — email`.
- **Staff**: `select user_id, full_name from profiles where user_id in (select user_id from user_roles where role in ('admin','manager','staff'))` (or reuse the existing staff-list helper if present). Render `full_name`.
- Cache both lists in component state; fetch once on mount.

### 3. New UI components (inline, same file to match existing pattern)
- `FilterCombobox` — wraps shadcn `Popover` + `Command` (`CommandInput`, `CommandList`, `CommandItem`) for searchable single-select. Reused for both dropdowns.
- Active-filter chips row using existing `Badge` + `X` icon.

### 4. CSV export
- Extend `exportToCsv` filename builder to append `_applicant-{slug}` and `_staff-{slug}` segments when set.

### 5. Memory
- Add a short note to `mem://features/application-review/revert-courtesy-defaults.md` (or a new `mem://features/audit-log/filters.md`) documenting the Applicant + Staff filters and that they compose with Action + Date + Search.

## Out of scope
- No schema changes. No new RPC (client-side post-filter fallback if needed).
- No multi-select. No saved filter presets.
- No changes to the RevertedBanner or revert flow.
