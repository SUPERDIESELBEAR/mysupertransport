# Mail-queue RPC wrappers: pre-migration state of record

**Captured 2026-08-01, before migration `20260801120000_fix_definer_pins_and_grants.sql`.**

That migration rewrites `proacl` and `proconfig` on the functions below. Those two
columns were the last surviving evidence of how the database was configured, and
they carry no history — once overwritten, the prior state is unrecoverable. This
file exists so the state is readable after the fix.

Scope: four `pgmq` mail-queue wrappers, plus three RODS functions repinned in the
same migration.

---

## 1. The finding

Four `SECURITY DEFINER` functions in `public` — `enqueue_email`, `read_email_batch`,
`delete_email`, `move_to_dlq` — were, as of this capture:

- **Unpinned.** No `search_path` at all, so each inherited the caller's. For a
  `SECURITY DEFINER` function this is the classic privilege-escalation shape: a
  caller may prepend a schema they control and have the body resolve to their
  objects while executing as the owner. `enqueue_email` and `read_email_batch`
  both call `pgmq.create()` on the `undefined_table` path, which is unpinned
  owner-privileged DDL.
- **Executable by `anon` and `authenticated`.** Both roles hold explicit `X`.
  PostgREST exposes `public` functions as RPC, so an unauthenticated caller
  holding only the publishable key could invoke all four.

Composed, that means an anonymous caller could create queues, enqueue arbitrary
payloads, move messages to a dead-letter queue, delete messages, and — via
`read_email_batch` — **read message payloads out of a queue they name**.

### What the queues carry

Fully rendered outbound email. The payload shape at the enqueue sites
(`supabase/functions/auth-email-hook/index.ts`,
`supabase/functions/send-transactional-email/index.ts`) is:

    { to, subject, html, text, message_id, label, idempotency_key,
      unsubscribe_token, run_id }

`q_auth_emails` therefore holds **live authentication URLs** — signup
confirmation, magic-link, password-recovery, invite, and email-change links —
inside the rendered `html`/`text` bodies. `q_transactional_emails` holds driver
and applicant correspondence: recipient addresses and notice contents.

### Exposure, to the extent it can be characterised

All eight `pgmq` tables held **0 rows** at capture:

| table | rows |
| --- | --- |
| `q_auth_emails` | 0 |
| `q_auth_emails_dlq` | 0 |
| `q_transactional_emails` | 0 |
| `q_transactional_emails_dlq` | 0 |
| `a_auth_emails` | 0 |
| `a_auth_emails_dlq` | 0 |
| `a_transactional_emails` | 0 |
| `a_transactional_emails_dlq` | 0 |

The queues drain on a five-second `pg_cron` tick and archived rows are trimmed,
so a message is readable for seconds, not hours. That narrows the window a
caller would have to hit — it does **not** establish that nothing was read. A
poller does not need luck.

**No trail exists that would confirm or exclude reads.** See §4.

---

## 2. Verbatim pre-change state

### 2.1 `proconfig` and `prosecdef`

| function | `prosecdef` | `proconfig` |
| --- | --- | --- |
| `delete_email(text,bigint)` | `t` | `NULL` |
| `enqueue_email(text,jsonb)` | `t` | `NULL` |
| `move_to_dlq(text,text,bigint,jsonb)` | `t` | `NULL` |
| `read_email_batch(text,integer,integer)` | `t` | `NULL` |
| `purge_rods_day(uuid,text)` | `t` | `search_path=public` |
| `purge_rods_day(uuid,text,text)` | `t` | `search_path=public` |
| `record_rods_purge_storage_result(uuid,text[],jsonb,boolean)` | `t` | `search_path=public` |

### 2.2 `proacl`

The four mail-queue wrappers, identical on each:

    postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
      | service_role=X/postgres | sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres
      | sandbox_exec=X/postgres

`purge_rods_day(uuid,text)`:

    postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
      | service_role=X/postgres | sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres
      | sandbox_exec=X/postgres

`purge_rods_day(uuid,text,text)` and
`record_rods_purge_storage_result(uuid,text[],jsonb,boolean)` — note the leading
`=X/postgres`, which is the **`PUBLIC`** grant, still present:

    =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
      | service_role=X/postgres | sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres
      | sandbox_exec=X/postgres

The two RODS functions carrying `PUBLIC` execute are defended in-body: each opens
with a positive-form service-role check that raises `42501` otherwise. The grant
is still wrong and the migration narrows it; the body is why it was not
exploitable.

### 2.3 `pg_get_functiondef`

Full text of all seven as they stood at capture:

    CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
     RETURNS boolean
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    BEGIN
      RETURN pgmq.delete(queue_name, message_id);
    EXCEPTION WHEN undefined_table THEN
      RETURN FALSE;
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
     RETURNS bigint
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    BEGIN
      RETURN pgmq.send(queue_name, payload);
    EXCEPTION WHEN undefined_table THEN
      PERFORM pgmq.create(queue_name);
      RETURN pgmq.send(queue_name, payload);
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
     RETURNS bigint
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE new_id BIGINT;
    BEGIN
      SELECT pgmq.send(dlq_name, payload) INTO new_id;
      PERFORM pgmq.delete(source_queue, message_id);
      RETURN new_id;
    EXCEPTION WHEN undefined_table THEN
      BEGIN
        PERFORM pgmq.create(dlq_name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      SELECT pgmq.send(dlq_name, payload) INTO new_id;
      BEGIN
        PERFORM pgmq.delete(source_queue, message_id);
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;
      RETURN new_id;
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    BEGIN
      RAISE EXCEPTION 'purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row''s objects.'
        USING ERRCODE = '42501';
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.purge_rods_day(_day_id uuid, _reason text, _storage_owner text)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    DECLARE
      v_day public.rods_days;
      v_claim_role text;
      v_allowed boolean;
      v_audit_id uuid;
      v_paths text[] := '{}';
      v_disposition text;
    BEGIN
      BEGIN
        v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
      EXCEPTION WHEN others THEN
        v_claim_role := NULL;
      END;
    
      -- Positive form. A NULL claim must not make the predicate NULL and fail open.
      v_allowed := coalesce(v_claim_role = 'service_role', false)
                OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false);
    
      IF NOT v_allowed THEN
        RAISE EXCEPTION 'purge_rods_day may only be called by the service role.'
          USING ERRCODE = '42501';
      END IF;
    
      -- Deliberateness gate. storage.protect_delete() means this function cannot
      -- remove the row's objects itself, so the caller must name itself as the
      -- party that will. Checked positively for the same fail-open reason.
      IF NOT coalesce(btrim(_storage_owner), '') <> '' THEN
        RAISE EXCEPTION 'purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row''s objects.'
          USING ERRCODE = '42501';
      END IF;
    
      IF coalesce(btrim(_reason), '') = '' OR length(btrim(_reason)) < 12 THEN
        RAISE EXCEPTION 'A written reason of at least 12 characters is required to purge a record of duty status.';
      END IF;
    
      SELECT * INTO v_day FROM public.rods_days WHERE id = _day_id FOR UPDATE;
      IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'Log not found.';
      END IF;
    
      -- Only what this row owns. Never a prefix: an amendment and its original
      -- share a <operator_id>/<log_date>/ folder.
      IF coalesce(btrim(v_day.pdf_path), '') <> '' THEN
        v_paths := v_paths || v_day.pdf_path;
      END IF;
      IF coalesce(btrim(v_day.certification_signature_path), '') <> '' THEN
        v_paths := v_paths || v_day.certification_signature_path;
      END IF;
      IF coalesce(btrim(v_day.source_document_path), '') <> '' THEN
        v_paths := v_paths || v_day.source_document_path;
      END IF;
    
      v_disposition := CASE WHEN array_length(v_paths, 1) IS NULL
                            THEN 'not_applicable' ELSE 'pending_caller' END;
    
      INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
      VALUES (
        auth.uid(),
        coalesce(v_claim_role, session_user),
        'rods_day_purged',
        'rods_day',
        v_day.id,
        coalesce(v_day.log_date::text, '(no date)'),
        jsonb_build_object(
          'reason', btrim(_reason),
          'operator_id', v_day.operator_id,
          'log_date', v_day.log_date,
          'status', v_day.status,
          'certified_at', v_day.certified_at,
          'record_source', v_day.record_source,
          'supersedes_day_id', v_day.supersedes_day_id,
          'locked', v_day.locked,
          'storage_paths', to_jsonb(v_paths),
          'storage_owner', btrim(_storage_owner),
          'storage_disposition', v_disposition,
          'cfr_note', '49 CFR 395.8(k)(1) requires six months retention'
        )
      )
      RETURNING id INTO v_audit_id;
    
      PERFORM set_config('rods.purge', 'on', true);
      PERFORM set_config('rods.privileged', 'on', true);
    
      DELETE FROM public.rods_events WHERE rods_day_id = _day_id;
      DELETE FROM public.rods_amendments WHERE rods_day_id = _day_id;
      DELETE FROM public.rods_days WHERE id = _day_id;
    
      RETURN jsonb_build_object(
        'day_id', _day_id,
        'audit_id', v_audit_id,
        'storage_paths', to_jsonb(v_paths),
        'storage_disposition', v_disposition
      );
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
     RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    BEGIN
      RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
    EXCEPTION WHEN undefined_table THEN
      PERFORM pgmq.create(queue_name);
      RETURN;
    END;
    $function$
    
    -- ----8<----
    
    CREATE OR REPLACE FUNCTION public.record_rods_purge_storage_result(_audit_id uuid, _removed text[], _failed jsonb DEFAULT '[]'::jsonb, _late boolean DEFAULT false)
     RETURNS void
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    DECLARE
      v_claim_role text;
      v_disposition text;
    BEGIN
      BEGIN
        v_claim_role := current_setting('request.jwt.claims', true)::json ->> 'role';
      EXCEPTION WHEN others THEN
        v_claim_role := NULL;
      END;
    
      IF NOT (coalesce(v_claim_role = 'service_role', false)
              OR coalesce(session_user IN ('postgres', 'supabase_admin', 'service_role'), false)) THEN
        RAISE EXCEPTION 'record_rods_purge_storage_result may only be called by the service role.'
          USING ERRCODE = '42501';
      END IF;
    
      v_disposition := CASE
        WHEN coalesce(jsonb_array_length(coalesce(_failed, '[]'::jsonb)), 0) > 0 THEN 'completed_with_failures'
        WHEN coalesce(_late, false) THEN 'completed_late'
        ELSE 'completed'
      END;
    
      UPDATE public.audit_log
         SET metadata = metadata
                     || jsonb_build_object(
                          'storage_removed', to_jsonb(coalesce(_removed, '{}'::text[])),
                          'storage_failed', coalesce(_failed, '[]'::jsonb),
                          'storage_disposition', v_disposition
                        )
       WHERE id = _audit_id
         AND action = 'rods_day_purged';
    END;
    $function$
    
    -- ----8<----
    

---

## 3. How the grants came to be wide — a correction to the first reading

The initial account was "revoked once, then re-widened out of band." Reading the
original migration line by line, that is not quite right, and the accurate version
matters for anyone deciding whether provisioning is at fault.

`supabase/migrations/20260428151032_email_infra.sql` (lines 193–205) does revoke —
but only from `PUBLIC`:

    REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;
    -- ... same pair for read_email_batch, delete_email, move_to_dlq

`REVOKE ... FROM PUBLIC` clears the implicit default-`PUBLIC` execute that every
new function receives. It does **not** touch explicit grants to named roles, and
`anon` and `authenticated` hold **explicit** `X` in the ACL above — not the
implicit `PUBLIC` entry, which is absent from all four.

So there are two candidate histories, and the evidence does not separate them:

1. A blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated`
   — a standard Supabase provisioning statement — ran at some point after the
   migration and granted the two roles explicitly.
2. The wrappers were re-created out of band by email-infrastructure provisioning,
   inheriting the schema's default ACL.

Either way the operative fact is the same and worth stating plainly: **the original
revoke was incomplete.** It defended against the implicit grant and left the named
roles unaddressed. A later schema-wide grant then sailed straight past it. The new
migration names `PUBLIC`, `anon`, and `authenticated` explicitly for that reason.

This is a defect in the original migration as much as an out-of-band event. Do not
record it purely as provisioning misbehaviour.

---

## 4. Dating the change: four dead ends, all checked 2026-08-01

**The date could not be established.** Every avenue was tried; each is recorded so
the next reader does not repeat them.

1. **Migration history.** `20260428151032_email_infra.sql` is the only recorded
   migration touching these four names. No later migration redefines them or
   alters their grants. The widening left no row in
   `supabase_migrations.schema_migrations`.
2. **Commit timestamps.** `track_commit_timestamp` is **`off`**, so
   `pg_xact_commit_timestamp(pg_proc.xmin)` raises `55000`. This is the only
   mechanism that would have dated a catalog-row modification directly.
3. **Transaction-ID ordering.** Every `pg_proc` row in `public` shares one frozen
   `xmin` (`6815093`, age 10), consistent with a physical restore or major-version
   upgrade having rewritten the catalog. Even with commit timestamps on, that
   freeze would have flattened the signal.
4. **Function-call statistics.** `track_functions` is `none`;
   `pg_stat_user_functions` is empty. No call counts, no last-call times.

`proacl` itself carries no history — it is a single current-value column. Once the
migration rewrites it, §2.2 above is the only surviving copy.

---

## 5. Standing finding: privilege changes on this database are not investigable after the fact

*This is not a detail of the mail-queue incident. It is a standing condition of the
database, it affects every future question of this kind, and it is the direct
reason a real question could not be answered.*

`log_statement` is **`ddl`** — set from the configuration file, active now.
Security-relevant DDL **is captured**: `GRANT`, `REVOKE`, `CREATE` / `ALTER` /
`DROP FUNCTION`, and role changes are all written to the Postgres log as they
happen. Whatever statement widened these four grants **was logged**.

The queryable retention window is approximately **ten minutes**:

| source | query range requested | rows returned | span covered |
| --- | --- | --- | --- |
| `postgres_logs` | 90 days | 2,790 | ~9 minutes |
| `edge_logs` | 90 days | 44 | ~8 minutes |

`edge_logs` does record RPC paths with status codes and user agents, so a
PostgREST call to `/rest/v1/rpc/read_email_batch` would be visible — within the
same ~8-minute horizon. Zero calls to any of the four names appear in the retained
window. **That absence carries no weight.** The window is minutes; the exposure
was open for an unknown period likely measured in months.

**The failure is not capture. It is retention.** Every privilege change on this
database is logged and then discarded within roughly ten minutes. Once that window
passes, no privilege change can be attributed, dated, or reconstructed. That is
true of this incident and it will be true of the next one.

### Ranked remediation

1. **Extend or export Postgres log retention.** Highest value available here. It
   costs *no* write overhead — the data is already being produced and is being
   thrown away. It would have turned this entire investigation into a single
   lookup. Recommended regardless of what else is done.
2. **Enable `track_commit_timestamp`.** Weaker instrument, and it is a decision
   rather than something applicable from here:
   - **Not settable from the app.** `pg_settings` reports `context = postmaster`
     and `source = default`. It requires `ALTER SYSTEM` plus a **full database
     restart**, which is a platform-level operation.
   - **Cost:** 12 bytes per transaction in the `pg_commit_ts` SLRU, written on
     every commit, retained to the transaction-ID horizon. Real but small at this
     project's write volume; the restart is the more disruptive part.
   - **Partial coverage.** It dates a catalog row's last modification, which does
     cover a bare `GRANT` (that updates `proacl`). But it would not have survived
     the catalog-wide freeze that flattened `xmin` here.

Take both if available. Take retention regardless.

### Outstanding: request to the platform, raised 2026-08-01

Because `log_statement = ddl` means the widening statement *was written to a log
file*, the event may still exist outside the queryable window. Asked of the
platform, before the migration was applied:

- Are raw Postgres log archives retained anywhere beyond the queryable window —
  cold storage, object-storage export, or platform-side backups of the log stream?
- Can a longer window be made available on request for a specific date range on
  this project?
- If archives exist, the target is any `GRANT ... ON FUNCTION` or
  `CREATE OR REPLACE FUNCTION` naming `public.enqueue_email`,
  `public.read_email_batch`, `public.delete_email`, or `public.move_to_dlq`, at
  any time after `20260428151032_email_infra.sql` was applied.

**Status at time of writing: awaiting answer.** Applying the migration does not
foreclose it — the migration overwrites `proacl`, not the logs.

- **If the answer is no:** "cannot be established" in §4 becomes final, a settled
  conclusion rather than an unfinished search. Record it here and close the item.
- **If the answer is yes:** the window can be dated precisely. That is a
  materially different fact for anyone weighing notification obligations, and this
  file should be amended with the retrieved range and the finding re-assessed.

Replace this subsection with the answer either way. An unanswered question left
unrecorded becomes an assumption.

---

## 6. Collateral: two migration files with no recorded row

Noted while auditing history, and **resolved — it is benign.** Recorded because it
is the same *shape* as the missing grant row (work reaching the database outside
recorded history), even though the cause is ordinary.

`supabase/migrations/` holds **326** files;
`supabase_migrations.schema_migrations` holds **324** rows.

An exact version-string comparison is misleading: disk filenames and recorded
versions differ by one to three seconds throughout, because the file is named a
moment after the row is written. Fuzzy-matching within a ten-second tolerance
leaves exactly two unmatched files, and both are **hand-named rather than
UUID-named**:

| file | nearest recorded row |
| --- | --- |
| `20260421111515_realtime_equipment_assignments.sql` | 17,990 s away |
| `20260710210000_rename_stage9_payroll_procedures.sql` | 324 s away |

Two hand-authored files, two missing rows. These were written directly into the
migrations directory rather than applied through the tooling that records history.
Unrelated to the ACL question.

---

## 7. What the migration changes

`20260801120000_fix_definer_pins_and_grants.sql`:

- **Seven repins.** The four mail-queue wrappers to
  `search_path = public, pgmq, extensions` (`pgmq` named explicitly — the
  extension lives in its own `pgmq` schema, not `extensions`); the three RODS
  functions from `public` to `public, extensions`. All seven bodies byte-identical
  to §2.3.
- **Four grant corrections.** `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
  then `GRANT EXECUTE ... TO service_role`, with the named roles listed explicitly
  — the omission that let this recur.

### Callers verified before revoking

Every caller of the four is an edge function using the service-role key:
`auth-email-hook`, `send-transactional-email`, `process-email-queue`. **No caller
in `src/` invokes any of them under the publishable key.** The revoke breaks
nothing.

### Standing guard

`src/test/definer-live-catalog.test.ts` asserts against `pg_proc` — the live
catalog — that none of the four is `anon`-executable. A test that reads migration
files cannot see this class of defect, which is precisely how it went unnoticed:
the migration on disk reads correct.

**If you find `anon=X` on these functions a third time**, the cause is not a
missing revoke in the migration. Check whether managed email infrastructure was
re-provisioned, and whether a schema-wide `GRANT ... TO anon, authenticated` ran.

---

## 8. Function-level EXECUTE audit (open register #6)

The four mail-queue functions were not a special case. They were the visible
edge of a schema-wide default: a blanket `GRANT EXECUTE ON ALL FUNCTIONS IN
SCHEMA public TO anon, authenticated`, applied at some point in the project's
history, that makes **every** function in `public` callable by an
unauthenticated PostgREST client unless something later revokes it.

Live inventory, 2026-08-01, of `SECURITY DEFINER` functions in `public` with
`anon` EXECUTE:

| Group | Count | Disposition |
| --- | --- | --- |
| Trigger functions (`RETURNS trigger`) | 51 | **Revoked.** `20260801130000` |
| Trigger functions granted to `authenticated` only | 2 | **Revoked.** `20260801140000` |
| Callable functions | 59 | Inventoried; see below |

### 8.1 The 53 trigger functions

Not directly reachable — PostgREST does not expose `RETURNS trigger` as an RPC
endpoint. They were revoked anyway, on two grounds: the grants are meaningless
(PostgreSQL checks `EXECUTE` on a trigger function at `CREATE TRIGGER` time,
not when it fires, so revoking cannot break an existing trigger), and 53 rows
of noise in the inventory is 53 places a real finding can hide.

The last two were found by `definer-live-catalog.test.ts` on its **first run**,
after the migration that was supposed to close the group. The inventory query
behind that migration filtered on `has_function_privilege('anon', ...)` alone;
those two carried `authenticated` but not `anon` and fell outside it. This is
the argument for a standing assertion over a one-off list, made concrete: a
hand-built inventory misses a case, a query re-derived on every test run
does not.

### 8.2 The 59 callable functions — NOT closed

These are recorded in `KNOWN_ANON_EXECUTABLE` in
`src/test/definer-live-catalog.test.ts` and are **not** fixed. Roughly 14 are
deliberate: token-gated endpoints an unauthenticated applicant must reach
(`get_application_by_draft_token`, `submit_pei_response`, `resolve_short_link`,
and similar). The remainder are unclassified. Each needs its body read before
its grant is touched — bulk-revoking would break live public endpoints, and
guessing which is which from the name is exactly the kind of shortcut that
produced this register entry.

The allowlist is asserted shrink-only against `KNOWN_ANON_EXECUTABLE_MAX`, so
it cannot grow without a visible diff on the number. A new anon-executable
definer function fails the guard on the next run whether it arrived through a
migration or through an out-of-band grant.

**This section stays open until that count reaches the deliberate set.**

### 8.3 Table privileges

Checked at the same time. `anon` holds exactly two table privileges —
`INSERT ON applications` (the public job-application form) and `SELECT ON faq`
(published FAQs, row-filtered by a `TO public` policy). Both are intended.

The file-scanning test that used to assert this (`never grants a table
privilege to anon` in `definer-search-path.test.ts`) was **removed**, not
fixed. It reported two offences, and both were artefacts: a `GRANT` on
`document_short_links` that a later migration had already revoked — grants are
not last-definition-wins, so the scan could never see the revoke — and a
`storage.objects` policy with `TO anon, authenticated` that its
statement-spanning regex attributed to an unrelated table three statements
earlier. The assertion now runs against the live catalog, where "what is
granted right now" is one query rather than an inference over text.
