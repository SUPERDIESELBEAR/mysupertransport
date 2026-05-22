# PEI Queue — Duplicate cleanup + Delete action

## What I found

Querying `pei_requests` against `applications`, there are 6 clear duplicates — pairs created within ~1 second of each other for the same applicant + same previous employer. In each pair, one row was actually sent and the other was left in `pending` (an orphan from the double-submit while you and Erika were both working on it).

| Applicant | Previous employer | Keep | Delete (duplicate) |
|---|---|---|---|
| Christopher Utt | Durante Equipment | `…783f4852` (sent 14:26) | `…960c0099` (pending) |
| Christopher Utt | Superior Mulch | `…b95b588c` (sent 14:36) | `…bf6ffb6f` (pending) |
| Ronald Lockett | Xxx Express Inc | `…16cfc664` (sent 14:41) | `…aa324fb9` (pending) |
| Brian Lewis | Heniff Transportation | `…4bdb3b68` (pending, earlier) | `…750663fe` (pending, +1s) |
| Brian Lewis | Kag | `…63d1389b` (pending, earlier) | `…e2faf9ad` (pending, +1s) |
| Brian Lewis | Viper Freight Llc | `…fa84c60e` (pending, earlier) | `…7d47c7e4` (pending, +1s) |

Notes:
- For Utt and Lockett, the "keep" choice is obvious — one of the pair already went out.
- For Brian Lewis, neither went out yet, so I'm proposing we keep the earlier-created row in each pair and delete the second. (Easy to swap if you'd rather keep the other side.)
- Steve Figueroa (Self / Yellow), Jose Guzman (Haynes / Pinch), and Hafeezullah Awal Khan are **not** duplicates — they're separate employers.

## Why this happened

Two staff opening the same applicant's PEI builder at the same time can each submit, creating one `pei_requests` row per employer per click. There's no uniqueness guard on (application_id, employer_name, employer_contact_email) and no in-flight lock, so a double-submit produces twins.

## Plan

### 1. Add a Delete action in the PEI Queue
- In `src/components/pei/PEIQueuePanel.tsx`, add a destructive "Delete request" action (icon button in the row's overflow menu, with a confirm dialog).
- Allowed only when `status` is `pending` or `gfe_documented` (never delete a row that's already `sent` / `responded` — those have audit value). Owner/admins only.
- On confirm: delete the `pei_requests` row (cascades to `pei_request_events` / `pei_responses` via existing FKs — I'll verify before wiring), toast success, refresh the queue.
- Write an `activity_log` entry (`pei_request_deleted`) capturing applicant, employer, status at deletion, and the staff user — so we keep an audit trail even though the row is gone.

### 2. Clean up the 6 existing duplicates
- Run a one-shot delete for the 6 IDs in the "Delete" column above, after you confirm the keep/delete choices for Brian Lewis.

### 3. (Recommended, small) Prevent future twins
- Add a partial unique index on `pei_requests (application_id, lower(employer_name))` **where status in ('pending','sent')** so a rapid double-click can't create a second active request for the same employer. Existing historical rows aren't affected.
- This is optional; say the word and I'll include it. Without it, the new Delete button still solves your immediate need.

## Technical details

- File to edit: `src/components/pei/PEIQueuePanel.tsx` (row actions), plus a small confirm dialog. No schema change required for the button itself.
- Deletion via `supabase.from('pei_requests').delete().eq('id', id)`.
- RLS: confirm staff role policy allows delete on `pei_requests`; add policy if missing.
- Cleanup: 6 `DELETE` statements by id, run via a migration so it's recorded.

## Questions before I build

1. **Brian Lewis pairs** — keep the earlier row in each pair (my default), or the later one?
2. **Prevent-future-twins index** — add it now, or skip for now?
