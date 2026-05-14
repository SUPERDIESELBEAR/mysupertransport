## Issue

Stale auto-GFE rows (and any other PEI rows created in error) can't be removed from the PEI tab — there's no UI affordance, even though the database already has a "Management delete PEI requests" RLS policy in place.

## Fix

Add a Delete button to each PEI request row in `src/components/pei/ApplicationPEITab.tsx`, plus a matching `deletePEIRequest` helper in `src/lib/pei/api.ts`.

### Behavior

- Trash icon button at the end of each row's action group, available on **every** status (pending, sent, follow_up_sent, final_notice_sent, completed, gfe_documented).
- Clicking opens a confirm dialog: *"Delete this PEI record? This permanently removes the request"* (plus *"and any submitted response"* when status is completed/gfe_documented). No undo.
- On confirm: call `supabase.from('pei_requests').delete().eq('id', r.id)`. The `pei_responses` and `pei_accidents` rows cascade automatically (existing `ON DELETE CASCADE`).
- After success: refresh the list and toast "PEI request deleted".

### Permissions

The existing RLS policy `Management delete PEI requests` already restricts deletion to staff/management — no new policies, no migration.

### Files touched

- `src/lib/pei/api.ts` — add `deletePEIRequest(id)`.
- `src/components/pei/ApplicationPEITab.tsx` — add Trash2 icon button + AlertDialog confirm + handler.

### Out of scope

- No changes to `PEIQueuePanel.tsx` (global queue) — separate ask if you want delete there too.
- No bulk-delete, no "delete all GFE rows" shortcut.

## Verification

1. Navigate to Jose Guzman → PEI tab → click trash on the stale GFE row → confirm. Row disappears.
2. Click Auto-build again → 3 pending rows appear (after the earlier `is_dot_regulated` fix).
3. Delete a `completed` row from a different applicant → confirm response/accidents are gone (cascade).
