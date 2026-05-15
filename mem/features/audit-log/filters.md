---
name: Audit Log Filters
description: Activity Log supports composable Action, Date, Search, Applicant, and Staff member filters; backed by search_audit_log RPC with p_actor_id + p_entity_id.
type: feature
---
The management Activity Log (`src/components/management/ActivityLog.tsx`) supports five composable filters (AND semantics):

- **Action** — chip row driven by `FILTER_OPTIONS`.
- **Date range** — preset chips + From/To pickers.
- **Search** — debounced free-text matching actor, subject, action, metadata.
- **Applicant** — searchable combobox sourced from `applications` (top 500 by last_name). Maps to `p_entity_id`.
- **Staff member** — searchable combobox sourced from distinct `actor_id` in recent `audit_log` rows. Maps to `p_actor_id`.

Active Applicant/Staff selections render as dismissible chips below the toolbar with a "Clear all" link when both are set. CSV export filename includes `_applicant-{slug}` and `_staff-{slug}` segments.

The `public.search_audit_log` RPC accepts `p_actor_id uuid` and `p_entity_id uuid` (both nullable, defaults NULL) in addition to the existing search/action/date/limit/offset params.