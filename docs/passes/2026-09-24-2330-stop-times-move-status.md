# Pass report — 2026-09-24 23:30 UTC — a recorded stop time moves the load's status

Prompt received COMPLETE, ending with "END OF PROMPT — the first line of your report must say whether you received this prompt complete, ending with this line."

## Owner decisions recorded (docs/tms-build-status.md)

P62 and P63, verbatim as given.

## Triggers on public.loads (live catalog, before writing 0065)

| Trigger | What it does on a status change | Behaves when a driver's tap causes it |
|---|---|---|
| aa_guard_load_financials (BEFORE UPDATE, guard_load_financials) | Nothing — it compares operator/company/broker/number/rate/fee columns only. `status` is not in its list. | Yes. The status-only UPDATE leaves every guarded column untouched, so a non-staff caller passes. |
| aa_stamp_tenant_company_id (BEFORE INSERT) | Not reached (INSERT only). | n/a |
| enforce_loads_operator_update_trg (BEFORE UPDATE) | Refuses an operator any field outside the driver-action list. | Only under the new transaction-local `superdrive.status_advance` flag, added in 0065 exactly like the existing `delivered_at_derive` allowance. A driver's direct write and his `update_load_status` call stay refused. |
| stamp_load_delivered_at (BEFORE INSERT OR UPDATE) | `delivered_at` unchanged → it copies OLD source/actor through. | Yes. |
| trg_loads_auto_handle_ingest (AFTER INSERT/UPDATE OF broker_reference_number) | Not fired by a status change. | n/a |
| trg_loads_log_status_change (AFTER UPDATE WHEN status distinct) | The ONE history writer. 0065 adds the transaction-local note to the row it already writes; no second writer. | Yes. |
| update_loads_updated_at (BEFORE UPDATE) | Stamps updated_at, which is in the operator allow-list. | Yes. |

Nothing refuses or misbehaves.

## Migration 0065 — drizzle/migrations/0065_stop_times_move_load_status.sql

- New `public.advance_load_status_from_stop()` — SECURITY DEFINER, `search_path = public, extensions`, EXECUTE revoked from PUBLIC/anon/authenticated; reads and writes only the load whose stop changed; no new table.
- New `trg_load_stops_advance_load_status` AFTER UPDATE OF the two time columns, WHEN the new value is non-empty and distinct (clearing never fires). It sorts after `derive_load_delivered_at`, so `delivered_at` is already set when the status moves.
- Rule table implemented exactly as specified, including `available` only with an operator, drop & hook counted as a pickup, last delivery = highest `stop_sequence` delivery (same stop `derive_load_delivered_at` uses), forward-only with skipping (one history row).
- `log_load_status_change()` now also reads `superdrive.status_change_note` into `notes`. Still the only writer.
- `enforce_loads_operator_update()` admits `status` only while `superdrive.status_advance` is on.
- Undo is in the file header comment.

## Proof (one transaction, raised at the end — nothing saved; residue counts below)

Load A (throwaway, demo driver 'ELD Demo Driver', covered; stops 1 pickup, 2 delivery, 3 delivery), acting as the demo driver through RLS:

```
1 dispatched
2 in_transit
3 in_transit          (arrival at stop 2, non-last delivery — no new history row)
4 at_delivery
5 delivered delivered_at_eq=true
6 delivered           (changed stop 1 departure — no status change, no new row)
7 delivered           (cleared stop 3 arrival — no status change)
8a refused: Operators may only update driver action fields on their loads
8b refused: You do not have permission to change load status
9 accepted (row + file) while status delivered
B delivered delivered_at_eq=true
C PROOF-C1 invoiced
C PROOF-C2 cancelled
C PROOF-C3 available
C history rows 0
HISTORY
PROOF-A | covered -> dispatched   | driver_app   | ELD Demo Driver | Automatic: arrival recorded at pickup (stop 1)
PROOF-A | dispatched -> in_transit| driver_app   | ELD Demo Driver | Automatic: departure recorded at pickup (stop 1)
PROOF-A | in_transit -> at_delivery| driver_app  | ELD Demo Driver | Automatic: arrival recorded at delivery (stop 3)
PROOF-A | at_delivery -> delivered| driver_app   | ELD Demo Driver | Automatic: departure recorded at delivery (stop 3)
PROOF-B | dispatched -> delivered | staff_screen | Leo Wallace     | Automatic: departure recorded at delivery (stop 1)
```

Load B: Leo Wallace recorded the last delivery's departure 3 hours ago on a dispatched load → delivered, staff_screen, Leo Wallace, note, and `delivered_at` equals that time. The skip wrote ONE row.

8c — setting the guard flag from the browser: `set_config` and `advance_load_status_from_stop` are not exposed through the REST schema:

```
{"code":"PGRST202", ... "Could not find the function public.set_config(...) in the schema cache"}
{"code":"PGRST202", ... "Could not find the function public.advance_load_status_from_stop(...) in the schema cache"}
```

Step 9 confirms the existing storage and `load_documents` policies admit a driver's own-load upload while the load is delivered.

Residue: loads named PROOF-% = 0; storage objects '%/pod/proof.pdf' = 0; total loads 18 (unchanged). No real load, stop or history row touched.

Exact counts (count(*)): pre-delivery loads with no delivery stop = **0**; loads with any drop & hook stop = **0**.

## Driver's app

- `StopCheckIn` shows one new line under "At the facility": "Record your arrival and departure at every stop. Your times update this load for dispatch."
- After a recorded time, it reads the load's status; when it is `delivered` it toasts "Load {number} is delivered. Upload your paperwork under Paperwork to finish."
- "Paperwork to finish" now carries an "Upload paperwork" button per load, revealing the same `LoadPaperworkUpload` (or `LoadoutCapture` for loadouts) the Today card uses. What counts as missing paperwork is unchanged.
- No other wording changed.

## Dispatch side

- Load page: saving a stop time refetches the load and invalidates the status-history query, so the new status and its note appear without a reload.
- Dispatch Board: `refetchInterval: 60_000` with `refetchIntervalInBackground: false`; focus refresh and the Refresh button unchanged. `loads` was NOT added to the realtime publication.
- Status History card already renders `notes` for staff; automatic rows now carry the note.

## Scheduled functions

`net._http_response` retention here starts 2026-09-24 17:03 UTC, and the edge-function log source returned no rows for these names, so for runs before 17:03 only `cron.job_run_details` is available (status only, no HTTP body). None were triggered by hand. CRON_SECRET not printed.

| Function | Last run (UTC) | Status | Body | Did its work? |
|---|---|---|---|---|
| send-birthday-anniversary | 2026-09-24 15:00:00 | cron: succeeded; HTTP body outside retention | not available | ran; body unreadable. Next run 2026-09-25 15:00 |
| notify-pwa-install | 2026-09-24 14:00:00 | cron: succeeded; body outside retention | not available | ran; body unreadable. Next run 2026-09-25 14:00 |
| cron-cert-reminders | 2026-09-24 15:00:00 | cron: succeeded; body outside retention | not available | ran; body unreadable. Next run 2026-09-25 15:00 |
| send-unread-message-reminders | 2026-09-24 15:00:00 | cron: succeeded; body outside retention | not available | ran; body unreadable. Next run 2026-09-25 15:00 |
| pei-auto-cadence | 2026-09-24 23:00:00 | 200 | `{"companies":1,"disabled_companies":0,"checked":22,"sent":0,"gfe":0,"paused":0,"skipped":22,"errors":[]}` | Yes — ran and was not refused |

None was refused.

## Tests

New: `src/test/stop-times-move-status.test.ts` (structure of the function, trigger, revokes, rule table, forward-only, clearing, driver guard, note writer; behavioural arm gated because the harness role has no UPDATE on `load_stops` — the behaviour is proven above) and `src/components/operator/__tests__/stopTimesMoveStatus.test.tsx` (hint line, delivered toast, no toast when not delivered, Paperwork-to-finish upload button for standard and loadout).

Full suite, `--maxWorkers=2`, verbatim:

```
 Test Files  2 failed | 223 passed | 2 skipped (227)
      Tests  2 failed | 2243 passed | 17 skipped (2262)
     Errors  2 errors
   Start at  23:04:34
   Duration  596.87s
```

Both failures were pooler `FATAL: (EAUTHQUERY) auth_query secret check timed out` (accessorial-adjustment-schema, fuel-import-live), plus the two matching vitest-worker `onTaskUpdate` timeouts. Re-run, verbatim:

```
 Test Files  2 passed (2)
      Tests  75 passed (75)
     Errors  1 error
   Start at  23:14:37
   Duration  65.67s
```

Typecheck (`tsgo --noEmit -p tsconfig.app.json`): clean, no output.

No edge function changed in this pass; none needed changing.

## Files changed

- drizzle/migrations/0065_stop_times_move_load_status.sql (new)
- src/integrations/supabase/types.ts (regenerated)
- src/components/operator/StopCheckIn.tsx
- src/components/operator/OperatorTodayCard.tsx
- src/pages/operator/OperatorPortal.tsx
- src/pages/dispatch/LoadDetailPage.tsx
- src/pages/dispatch/DispatchBoardPage.tsx
- src/test/stop-times-move-status.test.ts (new)
- src/components/operator/__tests__/stopTimesMoveStatus.test.tsx (new)
- docs/tms-build-status.md
- docs/tms-wish-list.md
- roadmap.md
- docs/passes/2026-09-24-2330-stop-times-move-status.md (this file)

## Contradictions

None. Commits are saved automatically; no git commands were run.
