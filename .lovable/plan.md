# Did anyone call `get_pei_requests_needing_action` during the exposure window?

Read-only investigation. No fixes applied. Bottom line first: **cannot be established for
the exposure window.** The only usable evidence covers minutes-to-hours of today, not
2026-05-13 → 2026-09-03.

## 1. Can I reach the API request logs?

**Yes — the analytics log store is reachable** from here (Supabase analytics query
interface, `logs` table). But it is effectively empty for the period that matters.

Query: `select source, count(*), min(timestamp), max(timestamp) from logs group by source`

| source | rows | oldest | newest |
|---|---|---|---|
| edge_logs (API gateway) | 283 | 2026-09-03 19:53:36Z | 2026-09-03 20:01:19Z |
| pgbouncer_logs | 34 | 19:58:31Z | 20:01:05Z |
| postgres_logs | 24 | 19:52:00Z | 20:01:00Z |
| function_logs | 22 | 19:52:02Z | 20:01:20Z |
| auth_logs | 15 | 20:00:08Z | 20:00:09Z |
| function_edge_logs | 12 | 19:52:02Z | 20:01:03Z |
| storage_logs | 12 | 19:59:49Z | 20:00:43Z |
| postgrest_logs | 10 | 19:51:44Z | 20:01:21Z |

**Oldest timestamp available anywhere in the log store: 2026-09-03 19:51:44Z** — roughly
ten minutes before this investigation. An explicit query for anything between
2026-05-01 and 2026-09-03 00:00 returned **0 rows**, and widening the `edge_logs` filter
to "since 2026-01-01" still returned the same 283 rows starting 19:53:36Z. So the window
is not a query-range artifact: nothing older is retained or exposed to this interface.

## 2. Hits for the function path

Searching `edge_logs` for the function name over the widest range available returned
**zero rows**. The only PEI-adjacent traffic in the retained window is REST table reads
(`/rest/v1/pei_requests`, `/rest/v1/applications`, status 200) from the last few minutes
— ordinary staff-portal activity, not RPC calls to the function.

Because retention starts 19:51:44Z today, this result says nothing at all about
2026-05-13 → 2026-09-03. Source IP and auth-role attribution could not be reported for
any hit, because there were no hits.

## 3. What Postgres itself records

- **`track_functions` = `none`** (`select current_setting('track_functions', true)`).
  Function-level statistics were never collected. `pg_stat_user_functions` contains
  **0 rows** for every function in the database, not just this one. This is the evidence
  that could have predated log retention, and it does not exist.
- **`pg_stat_statements` is installed** (in schema `extensions`). It holds 4,758
  statement entries, oldest `stats_since` **2026-03-07 01:59:49Z**. Filtering for the
  function name returns 7 entries, all from today:
  - two PostgREST RPC calls — `stats_since` **19:02:04Z** and **19:16:13Z** on 2026-09-03,
    which are the investigation's own pre-fix anon test and post-fix authenticated test
  - five DDL/GRANT/REVOKE statements from the 19:15:35Z remediation
  No entry exists with an earlier first-seen time. **This is suggestive, not conclusive**:
  `pg_stat_statements` has a fixed entry cap (4,758 entries are already tracked) and
  evicts least-used entries under pressure, so an RPC called once in June could have been
  evicted without trace. It also carries no caller identity, no IP, and no role — even a
  surviving entry could not have told you whether the caller was anon.
- **No audit trail of the call.** The function body is a bare `RETURN QUERY` with no
  logging of its own, and `public.audit_log` records application actions (296 PEI-related
  rows) written by app code and triggers — none of it records RPC invocation of this
  function.

## 4. The answer, stated precisely

**Cannot be established.**

- Not "no calls occurred." Nothing supports that claim.
- Not even "no calls in the retained window, covering X to Y" in any meaningful sense:
  the retained gateway window is **2026-09-03 19:51:44Z → 20:01:21Z**, about ten minutes,
  entirely after the fix landed at 19:15:35Z. It has zero overlap with the four-month
  exposure.
- `pg_stat_statements` gives partial, identity-free coverage back to at most
  2026-03-07 and shows no pre-2026-09-03 execution — but eviction means absence there is
  not proof, and it could not distinguish an anon caller from an authenticated one even
  if a row had survived.

Absence of evidence here is **not** evidence of absence. Any statement to counsel should
say: the carrier's own tooling cannot determine whether the endpoint was called during
the exposure window; longer-horizon API logs, if Supabase retains them outside this
interface, are the only remaining avenue.

## Suggested next step (not taken)

The one avenue not exhausted from here is a support/retention request to the platform for
API gateway logs covering 2026-05-13 → 2026-09-03. If the answer is that they are not
retained beyond a short window, that answer itself should be recorded in the incident
entry, which currently leaves the question OPEN.
