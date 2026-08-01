## Goal

Two gates are currently proven only in isolation. Prove both on the live path, in one run, against a demo operator.

## Part 1 — The `is_demo` three-state boundary, exercised for real

The previous run reset a clean operator (`rodsDaysPurged: 0`), so the 409 never fired. This time the certified day exists before the flag is touched.

Sequence, driven end to end:

1. Pick the demo operator (`operators.is_demo = true`) and confirm the starting state by query: zero `rods_days`.
2. **Certify a day** through the app's own path (Playwright, managed session, driver switched to the demo operator) — not a direct insert, so `certify_rods_day` and the `is_demo` stamping trigger both run. Assert by query: one `rods_days` row, `status = 'certified'`, `is_demo = true`.
3. **Call `set-demo-flag`** with `isDemo: false`. Assert:
   - HTTP **409**,
   - the message carries the certified count (`1`, singular wording),
   - and — the part that actually matters — `operators.is_demo` is still `true` afterwards. A 409 that nonetheless wrote the flag would be worse than no check.
4. **Purge** via `reset-demo-driver`. Assert `rodsDaysPurged: 1` and zero `rods_days` for the operator.
5. **Re-call `set-demo-flag`** with `isDemo: false`. Assert 200, and assert by query that `operators.is_demo`, `applications.is_demo` and `profiles.is_demo` all went false together — the flag is written in three places and only the operator row is returned in the response.
6. **Restore** `is_demo = true` (with the original `demo_label` / `demo_scenario`) so the sandbox account is left exactly as found.

That's the full three-state decision: blocked while watermarked logs exist, permitted once they don't.

## Part 2 — `maybeWipeForDemoReset` firing on a real stamp

The gate has never run against a moved `demo_reset_at`. Hydration reads `is_demo` and `demo_reset_at` off the freshly fetched `operators` row and calls the wipe before anything else is written, so the whole path is reachable from a page load.

1. Load the app as the demo driver, let hydration settle, then **seed every Dexie store the wipe drops** — `rods_pdfs`, `rods_documents`, `notice_pdfs`, `signature_images`, `roadside_manifest`, `rods_days_cache`, `rods_events_cache`, `pending_mutations`, `sync_queue`, `merged_packets`, `rods_divergences` — with recognisable sentinel rows, plus a `local_meta` row whose `demo_reset_at` is deliberately **older** than the server stamp (that's what arms the gate). Count every store and record the pre-state.
2. Reload. Hydration runs `maybeWipeForDemoReset` with the server's newer stamp.
3. Assert post-state: every seeded store empty of sentinels, and `local_meta.demo_reset_at` now equal to the server stamp. Note that `local_meta` is re-written by hydration immediately after the wipe, so the assertion is on the stamp having advanced, not on the row being absent.
4. **Assert idempotence** — reload once more and confirm the second load reports `already_applied` and does *not* wipe the freshly hydrated cache. A gate that fires on every load would silently destroy each new hydration.
5. **Assert the negative on the live path too**: with the stamp unchanged, seed sentinels again, reload, and confirm they survive. Same code, same page load, refusing.

Part 2 runs after Part 1's purge, so the stamp `reset-demo-driver` writes in step 4 is the one that arms it — a genuinely server-produced timestamp, not a hand-set value.

## Technical notes

- Playwright, headless Chromium, `http://localhost:8080`, managed session restored per the standard pattern. Scripts and evidence under `/tmp/browser/demo-boundary/`.
- Dexie seeding and counting via `page.evaluate` against the app's own `roadsideDb`, so the store names and key shapes come from the real schema.
- Edge functions called through the same authenticated path the UI uses, so `requireStaff` runs as it does in production.
- Post-run state verified by database query, not by trusting edge responses.
- Everything is left as found: operator back to `is_demo = true`, label and scenario restored, zero `rods_days`, Storage prefix empty.

## Written up in

`docs/eld-demo-boundary-2026-08-01.md` — the 409 body and certified count verbatim, the flag state at each of the three steps, and the Dexie store counts before and after each of the three reloads (armed, idempotent, unarmed).
