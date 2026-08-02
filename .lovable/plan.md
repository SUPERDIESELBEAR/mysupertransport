## §4 walkthrough, resumed at step 2

HARNESS-1 and the 2026-08-01 demo day are in place. Six steps, run in order, each one asserted before the next starts.

### Step 2 — Raise the request, and prove the driver can see it

Raise it from the read-only log view in the management console (`RodsAdminLogsPanel`), driven in a real browser as the signed-in staff user — not by an insert. That is the only way the console's own guard rails (certified-day requirement, one-open-per-date index, `requested_by` stamping) are part of the evidence.

Then assert the row: `status = 'open'`, `operator_id` / `log_date` stamped from the day, `rods_day_id` pointing at the version that prompted it.

**The bell assertion is the part that failed in Pass B, so it is done the hard way.** Open the driver's notification bell in a browser, on the Action tab, and screenshot the item rendered. Querying `notifications` for a matching row is explicitly *not* the assertion — a written row that renders nowhere is exactly the defect this catches, and it has already happened once on this surface (`eld_sync_alert` landed as tier `fyi` and never reached Action).

Signing in as the driver: the injected browser session belongs to the current staff user, not the demo driver, so the bell has to be reached through the existing **mobile preview session** mechanism (`preview_sessions`) — the same QR handoff that signs a phone in as a chosen driver.

**Fallback, held as approved:** if that path cannot be driven headlessly, the walkthrough **stops at step 2 and reports plainly**. No substitute notifications query — that would produce a green §4 proving exactly what Pass B's green proved. In that case §4 stays **open** and the register reads **"bell render unverified"**, not "§4 closed".

While the bell is open, confirm the tier by screenshot: the trigger writes `priority = 'high'`, which `resolveTier` does not recognise, so the tier falls through to the type registry, where `rods_correction_requested` is `action`. Confirmed by what renders, not by reading the registry.

### Step 3 — Amend path

Driver amends the 2026-08-01 day and certifies the amendment. Assert, from the database:

- the request flips `open → actioned`
- `resolved_by_day_id` is the **amendment's** day id, not the original's
- `resolved_at` is stamped
- Management's view shows the new certified version; the original reads `superseded` and stays locked

The close happens inside `certify_rods_day`, in the certifying transaction — so the assertion is that the request moved as a consequence of certifying, with no separate call.

### Step 4 — Decline path

A second request against a **different** date, so it never collides with the one-open-per-date index. Driver declines with a written response. Assert:

- `status = 'declined'`, `driver_response` holds the text
- the response is visible to Management in the console (read from the UI, not just the row)
- the resolution notification reaches the raising staff member

### Step 5 — Offline no-op replay

Certify a day that has **no** open request, offline, through the sync queue. Confirm the in-`certify_rods_day` close statement is a harmless no-op: zero rows touched, no exception, certification succeeds normally. This path runs on every single replay, so a close that raised on the empty case would break certification for every driver with nothing outstanding.

### Step 6 — Policy audit

Read `pg_policies` live and confirm no INSERT / UPDATE / DELETE policy on `rods_days` or `rods_events` exists for `management`, `owner`, `dispatcher`, or `onboarding_staff`. Report the **exact list observed**, not a verdict — including the SELECT policies that legitimately exist, so the read-only shape is visible rather than asserted.

### Step 7 — Cleanup

Purge every scratch day through the `purge-rods-day` edge function, **amendments before originals**. State that ordering in the report with its reason: the continuity guard refuses an original whose amendment still points at it — the constraint that made the earlier purge fail. Then remove:

- both correction requests
- HARNESS-1
- every notification the above spawned, on both the driver and staff sides

Finish with a count query across each touched table confirming zero rows.

### Technical notes

- Browser work runs headless against `localhost:8080`; screenshots land under `/tmp/browser/`.
- All scratch data is on the **demo** operator (`is_demo = true`). No step touches a live driver's record — the same rule the live certification test now enforces for itself.
- Assertions are read through `read_query` against the live database; the UI-facing ones are read off the rendered page.
- If any step fails, the walkthrough stops there and reports, rather than continuing and cleaning up the evidence.

§4 closes only when all six pass. Otherwise it stays open with the blocked step named. §5 is next.
