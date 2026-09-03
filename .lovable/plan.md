# "permission denied on `profiles`" — read-only triage

No code, migrations, or fixes. Every claim below names its source.

## 1. Is it real and current?

**Live analytics query.** The Postgres log store currently retains **19 rows spanning 2026-09-03 23:48:00Z to 23:56:00Z — about eight minutes.** `function_edge_logs` retains 9 rows over the same window; `edge_logs` holds a single row at 23:56:37Z.

A `match(event_message, 'permission denied')` filter over `postgres_logs` returns **zero rows**. There is therefore **no permission-denied error on `profiles`, on any table, at any role, inside the retained window** — and the window is far too short to say anything about when the reported errors supposedly occurred. No role, no timestamp, and no error text can be produced, because no matching record exists to produce them.

This item cannot be confirmed or refuted from logs. Items 2 and 3 carry the verdict.

## 2. Grants and policies as they are now

**First, a correction that matters.** `information_schema.role_table_grants` returned **zero rows** for `public.profiles`. That is the same misleading source recorded in `src/test/grant-parity-live.test.ts` — the view only exposes grants the calling role is party to. Reading it as "no grants exist" is exactly the false alarm that view has produced before. The real catalog says otherwise.

**`pg_class.relacl`, verbatim:**

```text
{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,
 sandbox_exec_qgxpkcudwjmacrdcyvhj=ar/postgres,sandbox_exec=ar/postgres}
```

**`has_table_privilege`:**

```text
anon           SELECT=false INSERT=false UPDATE=false DELETE=false
authenticated  SELECT=true  INSERT=true  UPDATE=true  DELETE=true
service_role   SELECT=true  INSERT=true  UPDATE=true  DELETE=true
```

RLS is **enabled** (`relrowsecurity = true`), not forced.

**Policies (`pg_policy`), all with `roles = NULL`, i.e. PUBLIC, so gated purely by the grant above:**

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can view their own profile | SELECT | `auth.uid() = user_id` | — |
| Staff can view all profiles | SELECT | `is_staff(auth.uid())` | — |
| Users can update their own profile | UPDATE | `auth.uid() = user_id` | — |
| Staff can update profiles | UPDATE | `is_staff(auth.uid())` | — |
| Allow insert on signup | INSERT | — | `auth.uid() = user_id` |

**Plainly:**

- A signed-in user **can** read their own profile row. Grant present, policy matches.
- **Staff screens work.** Driver roster, staff directory, dispatch load detail, inspection binder admin all run as staff, and `is_staff(auth.uid())` admits them to every row.
- **Operator-side reads of other people's profiles return nothing** — and this is by design, already recorded in `src/lib/staffContacts.ts`: the SELECT policy is self-or-staff, so a driver reading `profiles` for a dispatcher's name gets an empty set, not an error. That is an RLS filter, **not** `permission denied`. The two are different failure shapes and must not be conflated.

There is no GRANT-level defect on `profiles`.

## 3. The sign-in path

`src/hooks/useAuth.tsx`, `fetchProfile` (lines 110–130), runs as `authenticated` after `getSession`:

```ts
const { data } = await supabase.from('profiles').select(...).eq('user_id', userId).single();
if (data) { setProfile(data as ProfileData);
  if (data.account_status === 'pending') {
    supabase.from('profiles').update({ account_status: 'active' }).eq('user_id', userId).then(...)
```

Both halves match the project's recorded discarded-error pattern:

- **The read destructures `data` and never inspects `error`.** On any failure — permission, network, RLS returning zero rows through `.single()` — `data` is null, the `if` is skipped, and `profile` silently stays `null`. Nothing is thrown, logged, or shown.
- **The write is worse.** The `pending → active` update is fire-and-forget: no `error` is destructured at all, and the `.then()` optimistically sets local state to `active` **whether or not the row was actually updated**. A refused or zero-row update leaves the database at `pending` while the UI shows `active` — the exact symptom the report describes, reachable without any permission error at all.

Neither refusal is surfaced to the user. Both are swallowed.

The grants and policies in §2 mean neither call should be refused today for a signed-in user updating their own row. But the reported symptom does not require a refusal — a silent read miss reproduces it.

## 4. Is anything anonymous touching `profiles`?

- **Direct table access: no.** `anon` holds no privilege at all on `profiles`, so every anonymous PostgREST read is refused at the grant layer before RLS. No public route reads it: `/apply`, `/apply/ssn`, `/welcome`, `/inspect/:token`, `/pei/*`, `/ica/review/:token`, `/s/:code`, `/qpassport/view`, `/install`, `/splash` contain no `from('profiles')`.
- **Through functions: worth a separate look.** Eight anon-executable functions reference `profiles` in their bodies — `is_staff`, `add_pei_staff_note`, `archive_applicant_pei` (both overloads), `log_pei_manual_send`, `log_pei_phone_attempt`, `move_revisions_to_pending`, `submit_application_correction`. `is_staff` is the deliberately retained one recorded on 2026-09-03. The other seven are **staff-action** functions reachable anonymously; whether each carries its own internal authorization check was not established here. This is not the reported finding and is not a permission-denied path, but it is the more serious question in the vicinity.

## 5. Verdict

**The permission-denied claim is not establishable, and is not supported by the catalog.** The eight-minute log window cannot refute it — absence of evidence is not evidence of absence — but §2 shows no GRANT or policy on `profiles` that would produce `permission denied` for a signed-in user reading or updating their own row, and `anon` cannot reach the table at all. The most likely reading is a **stale re-emission consistent with the rest of the batch**.

**The pending→active concern is separate, real, and latent.** It is a genuine defect in `useAuth.tsx` regardless of any permission error: a silently discarded read and an unverified optimistic write. Classify it **live but latent** — it will not raise an error, it will quietly leave a driver at `pending` while the UI claims `active`.

## Contradicting the record

1. **`information_schema.role_table_grants` produced a false "no grants" reading again** on `profiles`, precisely as `grant-parity-live.test.ts` warns. If the monitoring finding was derived from that view, that alone explains the report.
2. **Seven anon-executable PEI/correction functions touching `profiles`** are not accounted for in the 2026-09-03 anon inventory narrative as staff-action functions; the record covers `is_staff` explicitly but these deserve a caller-authorization check of their own.
3. `permission denied` and "RLS returned zero rows" are being conflated in the incoming report. On `profiles` the operator-side empty result is designed behaviour, already documented in `staffContacts.ts`.

## Recommended next step (not executed)

Have `fetchProfile` inspect `error` and have the `pending → active` update verify it actually wrote before the UI claims `active`. Nothing on the grant or policy side needs to change.
