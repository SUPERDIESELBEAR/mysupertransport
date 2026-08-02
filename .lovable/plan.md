# Answers to both corrections

## 1. There is no server-side signal — so `blockedReason` is dropped

What the console would have been reading: nothing usable. Verified against the live schema — `rods_days` has exactly `status` (CHECK: `draft | certified | superseded`), `locked`, `certified_at`, `supersedes_day_id`. There is **no** sync column of any kind. `sync_rejected`, `sync_stalled`, `unsynced`, `local_certified_at` and the terminal-queue state all live only in `roadsideDb.rods_days_cache` (Dexie) on the driver's phone; `authorizedUnlock.ts` says so explicitly ("Management cannot write to a driver's Dexie"). `rods_unlock_events` only records an unlock *after* it happened, so it is not a live state either.

Any console-side inference would therefore be a guess, and the two failure modes are both real: a device that is stalled while the server row looks clean and certified, and a server row that looks certified while the device already unlocked back to draft.

**Design: allow raising against any certified, non-superseded day. No `blockedReason`, no client-side device-state inference in the console.** The driver's own view is the only place that knows, and it is where the explanation lives:

- Open-request banner renders below the existing `StalledLogBanner` / rejected-state UI.
- When the local day is stalled, rejected, or locked pending an authorized unlock: **Amend** is disabled with *"Resolve this log's sync problem first — then you can amend it."* **Decline** stays enabled, so the driver can always answer and the request can never sit open forever.
- The console shows `open` and makes no claim about the device.

Superseded is the one case with a real server signal (`status='superseded'`), and it resolves naturally: the request anchors on `(operator_id, log_date)` with `rods_day_id` as provenance only, so a request raised against a version that later gets replaced is still answered by the current version of that date.

## 2. The close goes inside `certify_rods_day`

Read the function. The amendment path is: `buildAmendmentDraft` INSERTs a **new row with `status='draft'`**, and `certify_rods_day` UPDATEs it in place — the function has `IF v_day.status <> 'draft' THEN RAISE ... P0014`, so it can *only* certify an existing draft row and never inserts a pre-certified one. An `AFTER UPDATE` trigger would in fact fire today.

Doing it inside the function anyway, as you asked, because that is the stronger guarantee: it cannot be bypassed by a future path that certifies differently, and the transaction already holds `v_day` under `FOR UPDATE`.

Placement: after the successful certification UPDATE and after the `rods_amendments` rows are written, before the return —

```
UPDATE public.rods_correction_requests
   SET status = 'actioned',
       resolved_at = now(),
       resolved_by_day_id = v_day.id,
       updated_at = now()
 WHERE operator_id = v_day.operator_id
   AND log_date   = v_day.log_date
   AND status     = 'open';
```

Unconditional on `supersedes_day_id`: a request is answered by a fresh certification of that date whatever produced it. The function is already `SECURITY DEFINER` with `search_path` set, so it writes past the driver's column whitelist legitimately. The idempotent replay branch (`replayed: true`) returns before this, so a replayed token cannot re-close anything.

# Build

## A. Prerequisite: read-only log view in the console

New `RodsAdminLogsPanel`, nav entry `view=eld-logs` in the Compliance group:

- Driver picker + date range; lists `rods_days` with superseded versions collapsed under their replacement; date, status, certified_at, lineage, open-request badge.
- Selected day rendered with the existing `RoadsideDayRender` (same component roadside and the PDF use), fed by a plain `rods_days` + `rods_events` read. No offline cache here.
- Names via `fetchProfileNames` keyed on `operators.user_id`. No embed into `profiles`.
- Read-only apart from "Raise correction request", offered on any `certified` day; on a `superseded` version the button is replaced by a link to the current version.

## B. Migration (one call, §0.2 treatment)

```
public.rods_correction_requests
  id, operator_id → operators(id), log_date date not null,
  rods_day_id → rods_days(id),            -- provenance only
  requested_by uuid, requested_by_name text, requested_at,
  issue text not null,
  status text check (open|actioned|declined) default 'open',
  driver_response text, resolved_at,
  resolved_by_day_id → rods_days(id),
  is_demo boolean, created_at, updated_at
```

- Partial unique index: `unique (operator_id, log_date) where status = 'open'` — one open request per date.
- GRANTs: `SELECT, INSERT, UPDATE` to `authenticated`; `ALL` to `service_role`. No `anon`.
- RLS: staff INSERT (`has_role` management/owner/onboarding_staff) + staff SELECT all; driver SELECT and UPDATE own rows via `operators.user_id = auth.uid()`. **No staff UPDATE. No DELETE policy for anyone.**
- Insert guard trigger: `rods_day_id` must be `status='certified'` (not draft, not superseded); `log_date` and `operator_id` stamped from that row.
- Update whitelist trigger: only `driver_response`, `status`, `resolved_at`, `updated_at` may change under the driver's role; `status` only `open → actioned|declined`; `declined` requires non-empty `driver_response`; `resolved_by_day_id` writable only by the definer path.
- `is_demo` stamped from the operator and immutable (`enforce_record_is_demo` pattern); `updated_at` trigger.
- `certify_rods_day` (both overloads' shared body) extended with the close above.

## C. Notifications

`src/lib/notifications/taxonomy.ts`:
- `rods_correction_requested` → tier `action`, category `compliance`, "Log Correction Requested" (driver).
- `rods_correction_resolved` → tier `watch`, category `compliance` (staff, on amend or decline).

Existing insert path; demo suppression unchanged.

## D. Driver and console surfaces

Driver: open-request banner with issue text, **Amend** (existing `buildAmendmentDraft` flow; disabled with the copy above when the local day is stalled/rejected/pending-unlock) and **Decline** (written response required).

Console: per-day request history — issue, raiser, status badge, driver response, resolved timestamp; auto-closed rows render *"Answered by amendment"* linking to `resolved_by_day_id`.

# Verification, in the app, after the migration

1. Re-read `pg_policies` for `rods_days` / `rods_events` and diff against the current set (`Drivers read/insert/update/delete own`, `Staff read all rods days`) — confirm no staff write policy appeared.
2. As a demo driver, certify two days — the table currently holds **0 rows** across the whole database, so there is nothing to test against otherwise.
3. Staff raises on day A → row exists; driver's bell shows it on **Action** with the right label.
4. Driver amends day A **from the generic amend button, not the request banner** → new certified version + `rods_amendments` trail; request `actioned` with `resolved_by_day_id`; both visible in the console.
5. Day B: decline with text → `declined`, response visible to Management.
6. Raise a second request on day A while one is open → rejected by the partial unique index.
7. Negative checks: staff UPDATE and DELETE denied; driver UPDATE of `issue` denied.
