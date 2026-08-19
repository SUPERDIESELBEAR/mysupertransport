# Fix: load creation stores the wrong kind of user id

Diagnosis confirmed: `create_load_with_stops` writes `auth.uid()` into `created_by` / `updated_by`, which are foreign keys to `profiles(id)`. No profile row has `id = user_id` (163 rows checked), so every attempt fails with `23503 loads_created_by_fkey` during the load insert. Nothing partial is written — the whole function rolls back.

## 1. One shared way to get the actor's profile id

New `public.current_profile_id()` — `STABLE SECURITY DEFINER`, `search_path = public`, returns `SELECT id FROM public.profiles WHERE user_id = auth.uid()`. Execute revoked from public/anon, granted to authenticated and service_role.

## 2. `create_load_with_stops`

- `created_by` / `updated_by` use `current_profile_id()`.
- `dispatcher_id` is derived server-side: it is set to the caller's profile id when the caller holds the dispatcher role, and the `dispatcher_id` key in the payload is ignored. The client stops looking up profiles entirely.
- No schema change, no form structure change.

## 3. Audit of the other TMS tables — four more of the same bug

Every profiles-FK writer was checked. These insert `auth.uid()` into a `profiles(id)` column and get the same treatment:

- `log_load_status_change` — `load_status_history.changed_by`
- `log_broker_factoring_change` — `broker_factoring_history.changed_by`
- `log_claim_flag_change` — `claim_flag_history.changed_by` (both insert and update branches)
- `sync_claim_flag_resolution` — `claim_flags.resolved_by`

Clean — no change needed:

- `company_documents_set_version`, `company_documents_supersede_prior`, `stamp_broker_factoring_status_change` — never touch actor columns.
- Client code: nothing writes `created_by`/`updated_by`/etc. on the new tables. The broker quick-add in `BrokerSelect.tsx` leaves `created_by` null; the only client profile lookup is the one in `CreateLoadPage.tsx` being removed.
- `user_view_preferences.user_id` correctly stores the auth user id — untouched.
- `pay_policies`, `pay_policy_assignments`, `brokers`, `broker_documents`, `company_documents`, `document_send_log`, `load_documents`, `document_exceptions`, `load_number_config` have no server-side writer yet, so nothing to fix — future writers use `current_profile_id()`.

## 4. Load number separator

Already correct: the seeded row is `prefix=ST`, `separator=''` (empty), `include_year=true`, `padding=3`, `reset_annually=true`, `current_year=2026`, `next_sequence=2`. It produces `ST26001` — the `ST26-004` in the earlier write-up was an illustrative example, not real output. No change, and the sequence counter is left alone.

## 5. Client error surfacing

New shared `src/lib/dbError.ts`:

- `getDbErrorMessage(err, fallback)` — reads `message`, `code`, `details`, `hint` off a PostgrestError-shaped object (supabase-js errors are plain objects, not `Error` instances, which is exactly why the toast showed only the generic fallback), and returns a readable string including the code.
- `logDbError(label, err, payload)` — `console.error` with the full error object and the submitted payload.

`CreateLoadPage.tsx` drops the `instanceof Error` narrowing, uses both helpers in its catch, and no longer queries `profiles`.

## 6. Verification

After the migration, save a standard load end to end from the form and confirm the row and its two stops exist with `created_by` pointing at the correct profile.
