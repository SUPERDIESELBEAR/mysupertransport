# Alvys M1 pass 3 — broker tracking link (P52, P64) — 2026-09-24 23:59 UTC

Prompt received complete, ending with "END OF PROMPT — the first line of your report must say whether you received this prompt complete, ending with this line."

## Step 0
P64 recorded verbatim in docs/tms-build-status.md.

## Step 1 — migration 0066_broker_tracking_link
- `_load_tracking_assert_staff(uuid)` (new private helper, EXECUTE revoked from PUBLIC/anon/authenticated): caller must be dispatcher/management/owner AND load.company_id = current_company_id(), written in the function.
- `get_or_create_load_tracking_link(uuid) → uuid`: refuses cancelled/TONU ("Tracking is off for cancelled loads."); returns the active token; if revoked, rewrites the row with a NEW token and clears revoked_at (the old token no longer exists → gate says not_found forever; access log keeps its rows, no FK). Row company = load company. PUBLIC/anon revoked, authenticated granted.
- `revoke_load_tracking_link(uuid)`: same checks; sets revoked_at.
- `resolve_load_tracking_link(uuid) → jsonb`: through the unchanged `_share_token_gate` (logging, 60/hour limit untouched). Throttled → `{"outcome":"throttled"}`. NULL when unknown/revoked/expired, scope ≠ load_tracking, cancelled/TONU, or delivered > 7 days ago (delivered_at, else first history row reaching delivered). Labels computed in the database. anon + authenticated granted.
- All four SECURITY DEFINER, search_path public, extensions. No new table; scope 'load_tracking' on share_tokens.

## Step 2 / 3 — screens
- Public `/track/:token` (LoadTrackingPage): calls only resolve_load_tracking_link; carrier name from the resolver; times via formatCarrierWindow / formatCheckInTime, which now take the resolver's timezone (default unchanged); 5-minute refresh while visible; neutral not-active and throttled pages; robots noindex meta on the route.
- "Broker tracking" card on the load page under the status controls, shown only when the user is dispatcher/management/owner. States: none / active (link, Copy link, Stop sharing + confirmation) / Create new link after revoke / cancelled-TONU off / expired after 7 days. No emails.

## Step 4 — proof (one raising transaction, rolled back)
Verbatim output:
```
1. token created by Leo: true; second call returns same token: true; row company = load company: true
   top keys: broker_reference_number,carrier,last_update_at,load_number,outcome,status_label,stops,timezone
   carrier keys: legal_name,mc_number,usdot_number
   stop keys: appointment_end,appointment_start,arrived_at,city,departed_at,facility_name,sequence,state,type
   JSON: {"stops": [{"city": "Salina", "type": "Pickup", "state": "KS", "sequence": 1, "arrived_at": null, "departed_at": null, "facility_name": "Acme Grain", "appointment_end": "2026-09-24T19:42:04.134689+00:00", "appointment_start": "2026-09-24T18:42:04.134689+00:00"}, {"city": "Joplin", "type": "Delivery", "state": "MO", "sequence": 2, "arrived_at": null, "departed_at": null, "facility_name": "Mill Co", "appointment_end": null, "appointment_start": "2026-09-25T01:42:04.134689+00:00"}], "carrier": {"mc_number": "788425", "legal_name": "SUPERTRANSPORT, LLC", "usdot_number": "2309365"}, "outcome": "ok", "timezone": "America/Chicago", "load_number": "PROOF-A", "status_label": "Scheduled", "last_update_at": null, "broker_reference_number": "BRK-778"}
2. covered: Scheduled | dispatched (no times): Dispatched | arrival pickup: At pickup/dispatched | departure pickup: In transit/in_transit | arrival delivery: At delivery/at_delivery | departure delivery: Delivered/delivered
   after invoiced: status=invoiced label=Delivered last_update before=2026-09-24T22:42:04.134689+00:00 after=2026-09-24T22:42:04.134689+00:00 unchanged=true invoiced history at=2026-09-24 23:42:04.134689+00
3. revoked: NULL | new token differs: true | new works: ok | old: NULL | unknown: NULL
   cancelled: NULL | tonu: NULL | create on cancelled refused: Tracking is off for cancelled loads.
   delivered 8d (delivered_at=2026-09-16): NULL | 6d: ok/Delivered
   inspection token to tracking resolver: NULL | tracking token to resolve_share_token rows: 0
4. demo driver create: 42501 You do not have permission to manage tracking links. | demo driver revoke: 42501 You do not have permission to manage tracking links.
   anon EXECUTE create/revoke/resolve: false/false/true | authenticated EXECUTE helper: false
   anon create call: 42501 permission denied for function get_or_create_load_tracking_link | anon revoke call: 42501 permission denied for function revoke_load_tracking_link
   carrier B current_company_id = co2: true | B dispatcher create: 42501 Load not found. | B dispatcher revoke: 42501 Load not found.
   B dispatcher SELECT share_tokens for load A: 0 rows (token still active after B revoke attempt: true)
5. access log (token | outcome | count):
   cancelled | ok | 1
   d6 | ok | 2
   d8 | ok | 1
   inspection | ok | 1
   tokA-new | ok | 2
   tokA-old | not_found | 1
   tokA-old | ok | 9
   tokA-old | revoked | 1
   tonu | ok | 1
   zero-uuid | not_found | 1
```
Notes: step 1's first resolve ran as `anon` (SET LOCAL ROLE). To prove billing changes don't move last_update_at, the proof load's history was backdated 2 hours inside the transaction before moving to invoiced as Erika Iroma (management); the invoiced row at 23:42 was not counted. "cancelled ok / d8 ok" are gate outcomes — the gate served the token, then the resolver returned nothing, which is the intended split. The tracking token's resolve_share_token call is one of the two tokA-new ok rows. Scratch carrier B, its auth user and dispatcher existed only inside the transaction.

Residue after rollback (count(*)): PROOF-% loads **0**; 'load_tracking' share_tokens rows **0**.

Live, no writes: `https://mysupertransport.lovable.app/track/00000000-…` shows the app's **404 page**, because the published site has not been republished since this pass. The same URL in the preview shows "This tracking link is not active. Contact the carrier for an update." Confirm on the published site after the next publish.

## Step 5 — loose ends from pass 2
(a) Re-ran accessorial-adjustment-schema + fuel-import-live. The unnamed error is `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`, the worker timeout that goes with a pooler failure. This run also had one pooler failure: `FATAL: (EAUTHQUERY) auth_query secret check timed out`. **It is the pooler**, not a code error.
```
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 74 passed (75)
     Errors  1 error
   Start at  23:58:05
```
(This run overlapped the full suite, which made the pooler worse; the four-file re-run below is clean.)
(b) 2330 report file list corrected: added drizzle/migrations/meta/0065_snapshot.json, drizzle/migrations/meta/_journal.json, public/version.json; removed types.ts (git shows no change).
(c) **Not possible in this harness**, exactly why: the harness role `sandbox_exec` holds SELECT + INSERT and no UPDATE on public.load_stops, and it belongs to no other role, so it cannot SET ROLE to one that has UPDATE. The rule is an AFTER UPDATE trigger; INSERT cannot fire it, and INSERT … ON CONFLICT DO UPDATE also needs UPDATE. The other rolled-back live tests use INSERT triggers. Granting UPDATE to the harness is forbidden. The test's header now says this; the arm stays visibly gated. The same limit applies to the new tracking test (no EXECUTE on the functions, no SET ROLE), so its behaviour rests on the proof above.

## Step 6 — tests
New: src/test/broker-tracking-link.test.ts (definer/pinning, grants, caller + company check, cancelled/re-issue, gate/scope/7-day, every label, key whitelist, gate unchanged); src/pages/__tests__/loadTracking.test.tsx (ok, not active, throttled, 5-minute refresh, noindex); src/components/dispatch/loadDetail/__tests__/brokerTrackingCard.test.tsx (every state).

Full suite `--maxWorkers=2`, verbatim:
```
 Test Files  4 failed | 224 passed | 2 skipped (230)
      Tests  5 failed | 2257 passed | 18 skipped (2280)
     Errors  2 errors
   Start at  23:57:30
   Duration  639.40s
```
Two failures were real: definer-live-catalog did not list the three new callable functions yet. They are now listed with reasons, anon MAX 33→34, authenticated MAX 142→145. The other three (billing-schema, broker-tracking-link, invoice-dispatch-reconciliation) were pooler EAUTHQUERY timeouts; the 2 errors are the matching worker timeouts. Re-run of all four files, verbatim:
```
 Test Files  4 passed (4)
      Tests  64 passed | 1 skipped (65)
   Start at  00:08:38
   Duration  50.47s
```
Typecheck (`tsgo --noEmit -p tsconfig.app.json`): clean. No edge function changed.

## Step 7 — records
Wish list: two future broker-link items added. Roadmap: milestone 1 item 4 done. Build status: P64 + pass entry.

## Files changed (as git shows)
- drizzle/migrations/0066_broker_tracking_link.sql (new)
- drizzle/migrations/meta/0066_snapshot.json (new)
- drizzle/migrations/meta/_journal.json
- src/integrations/supabase/types.ts
- src/App.tsx
- src/pages/LoadTrackingPage.tsx (new)
- src/pages/__tests__/loadTracking.test.tsx (new)
- src/components/dispatch/loadDetail/BrokerTrackingCard.tsx (new)
- src/components/dispatch/loadDetail/__tests__/brokerTrackingCard.test.tsx (new)
- src/pages/dispatch/LoadDetailPage.tsx
- src/lib/carrierTimezone.ts
- src/lib/operatorHome.ts
- src/lib/stopCheckIn.ts
- src/test/broker-tracking-link.test.ts (new)
- src/test/stop-times-move-status.test.ts
- src/test/definer-live-catalog.test.ts
- docs/passes/2026-09-24-2330-stop-times-move-status.md
- docs/passes/2026-09-24-2359-broker-tracking-link.md (new)
- docs/tms-build-status.md
- docs/tms-wish-list.md
- roadmap.md
