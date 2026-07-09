## Exclude archived / deactivated drivers from Pending Invite Acceptance

### Diagnosis
- `src/components/management/PendingInviteAcceptance.tsx` fetches applicants with `review_status = 'approved'` and filters out those whose `operators` row has `pwa_installed_at` or `last_web_seen_at`.
- **Archive** action sets `applications.review_status = 'denied'` with a `[Archived from pipeline]` prefix in `reviewer_notes`. Because the query already restricts to `approved`, archived applicants are naturally excluded — no change needed.
- **Deactivation** flips `operators.is_active = false`. The current query does not check this, so deactivated drivers still appear.

### Change
In `PendingInviteAcceptance.tsx` `fetchRows`:
- Also select `is_active` in the operators join query (`user_id, pwa_installed_at, last_web_seen_at, is_active`).
- Build a `deactivatedSet` of `user_id`s where `is_active === false`.
- Extend the candidate filter to exclude any applicant whose `user_id` is in `installedSet` **or** `deactivatedSet`.

### Out of scope
- No changes to the Compliance Summary, Pending Application Reviews, or other Overview sections.
- No schema changes; archive detection stays as-is since archived apps are already filtered by `review_status`.
