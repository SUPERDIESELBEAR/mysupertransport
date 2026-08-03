## 1. Fix the four re-grant victims, then re-read the live ACL

One migration re-asserting the revoke on the four functions whose creating migration already contained it and was overridden:

```sql
REVOKE ALL ON FUNCTION public.discard_rods_amendment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_ica_event(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_staff_help_knowledge(vector, int, float) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_share_token(uuid) FROM PUBLIC, anon;
```
with the intended `authenticated` / `service_role` grants re-stated after each, since `REVOKE ALL … FROM PUBLIC` would otherwise strip the grants the platform supplied and leave the function callable by nobody but the owner.

Then the proof step, which is the point: read `aclexplode(pg_proc.proacl)` for all four **after** the migration applies and report the grantee list verbatim. A correcting migration is subject to the same re-grant as the original — if `anon` is back, the fix moves to a post-apply statement and gets re-read again. Finish with `npm run test:guards`, including `definer-live-catalog`.

## 2. The 61 as a scoped item, with the write paths reported today

Not fixed in this change. Register entry: *61 `public` functions are anon-executable with no `REVOKE` in any migration — genuine omissions, distinct from the re-grant.*

The four named write paths were read at the body level today. All four hold a gate and all four fail closed for `anon`, because `auth.uid()` is NULL there:

| Function | Gate | Anon outcome |
| --- | --- | --- |
| `assign_user_role` | inline `EXISTS` on `user_roles` for management/owner; refuses `owner` outright | raises `Only management users can assign roles` |
| `remove_user_role` | same inline `EXISTS`; refuses `owner` outright | raises `Only management users can remove roles` |
| `set_go_live_with_override` | `has_role(auth.uid(), 'owner')`, `insufficient_privilege` | raises |
| `move_revisions_to_pending` | `is_staff(auth.uid())` | raises `not_authorized` |

Hygiene, not an open door: the grant layer is reachable, the body is not. The remaining 57 are reads and helpers, several taking a caller-supplied uuid (`get_user_roles`, `get_staff_contact_info`, `get_thread_participants`, `get_equipment_shipping_for_operator`, the PEI queue family) — the `has_role`/`is_staff` oracle shape already in the register, at wider scope.

### 2a. Separate register line — the duplicated membership check

*`assign_user_role` and `remove_user_role` each carry their own inline `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('management','owner'))` instead of calling `has_role`. Two copies of "who may assign roles" that can drift independently, governing role assignment itself — the same shape as the label drift and `AMENDABLE_HEADER_FIELDS`. Open item: consolidate both onto `has_role`, or record why the inline copy has to exist.*

## 3. Conventions doc

New section `## The platform re-grants EXECUTE after a migration applies`, placed **above** the copy target:

- The platform re-grants `EXECUTE` to `anon` and `authenticated` on newly created `public` functions after the migration applies; a `REVOKE` inside the creating migration does not survive it.
- The revoke must be re-asserted in a follow-up statement or migration, and re-read afterwards — a correcting migration is not exempt.
- `definer-live-catalog.test.ts` is the only thing that proves the end state. The file-reading guards parse migration text: correct as written, and irrelevant here, because the text is right and the live ACL is wrong.

Then correct §0's five-batches paragraph and §1a's closing sentence, which attribute all five batches to the default `PUBLIC EXECUTE` and hand-authoring. Both causes are real and must be separated: a migration with no `REVOKE` at all is a genuine omission; a migration that contains the `REVOKE` and is still anon-callable live is the re-grant. Four functions are proven re-grant victims; the 61 are proven omissions.

## 4. §8 — server-side divergence resolution

**The 8.3 path does not exist.** Confirmed by reading `hydrate.ts` and grepping the client: there is no directive mechanism. Divergence flows one way — `flagDivergence` writes Dexie and calls `raiseSyncAlert`, `openDivergenceDates()` drives the chip from local rows only, and `acknowledgeDivergence` is called only from `RodsView.tsx`. §8 builds the return leg rather than reusing one.

**Reconciliation precedence — both directions, stated as a rule:**

1. **Local acknowledgement with an undrained `acknowledge_divergence` queue entry wins.** Hydration must not un-acknowledge it, exactly as `unsynced` and `local_certified_at` protect the day cache in `cacheKeyedDay`. The Dexie divergence row keeps a pending marker until its queue entry reaches `succeeded`; while that marker is set, server state is ignored for that date.
2. Otherwise, a server row carrying `acknowledged_at` marks the local row acknowledged with the staff actor and reason.
3. A server row with no local counterpart is inserted, so a second device shows the same divergence.
4. Reconciliation runs before `openDivergenceDates()` is read, so the chip reflects merged state on first paint.

Tested in both directions: acknowledge in the console → hydrate a second device → chip clears and the staff reason is present (criterion 20); acknowledge offline with the queue undrained → hydrate → **chip stays clear**, and stays clear again after the entry drains.

The rest stands as planned: `rods_divergences` server table (no FK on `local_day_id`, with the column comment), `record_divergence` / `acknowledge_divergence` queue kinds in `CASCADE_EXEMPT_KINDS`, the console pane beside the malfunction list, the acknowledgement definer from the copy target with a distinct new SQLSTATE observed verbatim before any fixture asserts it, no roadside badge plus the decision comment beside the day strip, the ninth archive arm, and §0.3 demo suppression. Criteria 21 and 22 verified as written; scratch rows purged through `purge-rods-day`.

## Technical notes

- ACL reads use `aclexplode(pg_proc.proacl)` / `aclexplode(pg_class.relacl)` with extension-owned objects excluded via `pg_depend.deptype = 'e'` — never `information_schema`, per §3a.
- Tables remain clean: `anon` holds only `INSERT ON applications` and `SELECT ON faq`, and no `public` table has RLS on with zero policies and a grant. The re-grant is function-only.
