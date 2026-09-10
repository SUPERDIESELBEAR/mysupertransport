# Settling the Remaining Six Uncalled Functions

Read-only investigation. Nothing was changed. Search categories run for every one of the six, and stated individually below:

1. repo string literals under `src/` and `supabase/functions/` (incl. dynamic/ternary RPC names)
2. all-schema RLS policies (`pg_policies`, `qual` + `with_check`) — not just `public`
3. all-schema function bodies (`pg_proc.prosrc`, every schema)
4. all-schema views (`pg_views.definition`)
5. column defaults (`pg_attrdef`)
6. `cron.job` commands
7. live grants (`aclexplode`) and live definitions (`pg_get_functiondef`)
8. the migration that created each one, plus any `COMMENT ON`

Result of categories 2-6 for all six functions: **empty. Zero rows.** No policy, function body, view, default, or cron job in any schema references any of them. Repo hits are limited to `src/integrations/supabase/types.ts` (generated), guard registries, and docs.

---

## 1. `compliance_status(integer, integer)` — GROUP A

- **live**: `LANGUAGE sql IMMUTABLE`, not SECURITY DEFINER, `search_path=public`. Returns `text`: `missing` / `expired` / `critical` / `warning` / `valid` from `(days, window_days)`. Granted to `authenticated` + `service_role`; PUBLIC/anon revoked (2026-06-22).
- **repo**: created 2026-06-22 in the compliance-binder migration, section 3, immediately before section 4 which creates the view `v_compliance_items`. It was a helper for that view. No comment on it.
- **live, decisive**: `v_compliance_items` still exists — and its current definition does **not** call `compliance_status`. The view was re-authored to inline the CASE. So the single consumer it was built for dropped it.
- **repo**: no caller. Status classification in the UI is done client-side.
- **Recommendation: DROP.** What serves the purpose instead is named: the inlined CASE inside `v_compliance_items`, plus the client-side threshold logic. Low risk — it is a pure scalar helper with no state.

## 2. `eld_cron_status()` — GROUP A

- **live**: SECURITY DEFINER, `search_path=public, extensions, cron`, returns the last 10 `cron.job_run_details` rows for job `process-eld-escalations`, gated in-body on management/owner. Granted to `service_role` only (`anon`/`authenticated`/PUBLIC revoked 2026-08-01) — so the in-body role gate can never fire for a client, because no client role can execute it.
- **repo**: created 2026-08-01, migration comment: "Cron observability for the §3 console (the app role cannot read the cron schema)."
- **repo, replacement named**: `src/components/management/eld/ELDEscalationJobHealth.tsx` reads the **`eld_cron_runs` table** instead, with the comment "Passive health read of `eld_cron_runs`. No watchdog job." The console was built against a logged table, not against the `cron` schema view.
- **Recommendation: DROP.** Replacement named and shipped (`eld_cron_runs` + `ELDEscalationJobHealth`). It is also currently un-executable by any client role, so nothing can regress.

## 3. `assign_user_role(uuid, app_role)` — GROUP B

- **live**: SECURITY DEFINER, `search_path=public` (public-only pin, not `public, extensions`). Refuses `owner` outright; requires the caller to hold `management` or `owner`; inserts with `ON CONFLICT DO NOTHING`. Granted to `authenticated` + `service_role`; anon revoked 2026-08-19.
- **repo/live**: no caller in any of the eight categories.

## 4. `remove_user_role(uuid, app_role)` — GROUP B

- Same shape, same grants, same absence of callers. Refuses `owner` removal.

### How roles are actually assigned today — the answer is possibility ONE, with a caveat

Roles are assigned by **service-role edge functions using the admin client**, not by these two writers and not by hand. Named, with evidence (repo):

- `supabase/functions/invite-staff/index.ts:243` — `user_roles.upsert(...)` for staff roles
- `supabase/functions/invite-operator/index.ts:133` — `upsert({ role: 'operator' })`
- `supabase/functions/invite-truck-owner/index.ts:109` — `upsert({ role: 'truck_owner' })`
- `supabase/functions/get-staff-list/index.ts:426` — role change on an existing staff member; `:432` deletes removed roles; `:180` deletes all roles when a staff user is removed
- `supabase/functions/bootstrap-admin/index.ts:85` — `management`/`owner` bootstrap, behind `BOOTSTRAP_SECRET`
- `supabase/functions/delete-user-account/index.ts:96` — deletes roles
- `supabase/functions/provision-test-driver`, `provision-demo-driver` — test/demo drivers

So: **there is a supported onboarding path, it is well covered, and it is not these functions.** This is not possibility 2 either — no browser-side code writes `user_roles`; every `.from('user_roles')` hit in `src/` is a `.select()`. Not possibility 3 — nothing is manual.

Caveat worth stating: the edge-function path runs as `service_role` and therefore **bypasses the two protections these functions encode** — the "owner role cannot be assigned through the application" refusal and the management-only caller check. Those guarantees now live only in each edge function's own authorization preamble, checked per-function. `bootstrap-admin` can in fact assign `owner`, gated by a shared secret rather than by a role check.

- **Recommendation for both: KEEP, with a registered justification** naming the edge-function path as the live mechanism and these as the not-currently-used client-side writers. Do **not** drop them in the same pass that leaves the owner-assignment refusal existing nowhere else. The honest follow-up question — not a fix to make now — is whether the `owner`-refusal invariant should be moved to a database trigger on `user_roles`, which would cover the service-role path too. That is the real finding here, and it is larger than these two functions.
- Separately noted, not fixed: both carry a `public`-only search_path pin, against the documented `public, extensions` convention.

## 5. `get_pei_requests_needing_action()` — GROUP C

- **live**: SECURITY DEFINER, pinned `public, extensions`, in-body `auth.uid()` + `is_staff` gate, granted `authenticated` + `service_role` only. Returns applicant first/last name, employer name, **employer contact email**, status, date sent, deadline, days since sent, and a derived `action_needed`.
- **repo/live**: still no caller, in any category, after remediation.
- The PEI Queue screen uses `get_pei_queue()` (`src/lib/pei/api.ts:12`), which returns a superset of this data — including `days_remaining`, `is_overdue`, `days_since_sent`, staff notes, and archive fields. `action_needed` is the only thing unique to this function, and the queue UI derives its own urgency from `is_overdue` / `days_remaining`.
- **Recommendation: DROP.** What serves the purpose instead is named: `get_pei_queue()`. Keeping a guarded-but-uncalled function that returns prior-employer contact emails preserves exactly the condition that let this one go unreviewed for four months — the guard is correct today, but nobody exercises it, so nobody would notice if a later edit weakened it.

## 6. `get_application_pei_summary(uuid)` — GROUP C

- **live**: SECURITY DEFINER, `search_path=public` (public-only pin), in-body `is_staff` gate. Returns per-application PEI rows: employer name/city/state, employment dates, DOT-regulated flag, status, date sent, deadline, days remaining, GFE reason, has-response.
- **live, and this is a finding**: its grant list still includes **PUBLIC and `anon`** — it was never included in the 2026-09-03 revoke pass that cleaned up its sibling. The in-body `is_staff` gate means an anonymous caller gets `Not authorized` rather than data, so this is not a live leak; it is the same *shape* as the incident, one gate away.
- **repo/live**: no caller, in any category. The per-application PEI panel (`src/components/pei/ApplicationPEITab.tsx:199`) reads `pei_requests` directly with a table select.
- **Recommendation: DROP.** Replacement named: the direct `pei_requests` read in `ApplicationPEITab`. If instead it is kept, the PUBLIC/anon grant must be revoked in the same pass — a dropped function needs no revoke, which is one more reason to prefer the drop.

---

## Ranking, most urgent first

1. **`get_application_pei_summary`** — the only one of the six with a live PUBLIC/anon EXECUTE grant on PEI data. Its in-body gate holds, so this is not an incident; it is the last un-swept remnant of one, and it should not wait.
2. **`assign_user_role` / `remove_user_role`** — not the operational gap the expectation anticipated: role assignment works, via named edge functions. What is real is that the `owner`-assignment refusal now exists only inside functions nothing calls, while the live path runs as `service_role` and skips it. That is an invariant question, worth a decision, not an outage.
3. **`get_pei_requests_needing_action`** — guarded, uncalled, sensitive payload. Housekeeping with a memory.
4. **`compliance_status` / `eld_cron_status`** — pure housekeeping. Both replaced, both harmless.

## Proposed next pass, if approved

- Drop `compliance_status`, `eld_cron_status`, `get_pei_requests_needing_action`, `get_application_pei_summary`; remove their guard registrations and lower the affected ceilings; regenerate types.
- Keep `assign_user_role` / `remove_user_role` with a registered justification naming the edge-function mechanism; repin both to `public, extensions`.
- Record as an open question, not a fix: whether the `owner`-assignment refusal should become a `user_roles` trigger so the `service_role` path is covered too.
- Predict the function-reachability count before running it, and report the actual against the prediction in both directions.
