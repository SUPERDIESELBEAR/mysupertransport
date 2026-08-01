## 1. The throttled card — one finding, from the rendered page

I rendered `/inspect/:token` with the RPC response stubbed to `outcome: 'throttled'` (no database was touched, no access-log row written). Full visible text of the page:

```text
SUPERTRANSPORT
Roadside Document Viewer
Secure Link
Too Many Opens

This link has been opened too many times in the past hour and is
temporarily rate-limited. It is still valid — wait a few minutes and
reload this page.
```

The card body is clean: no driver, no carrier, no document name, no dates, no operator id. Reading only the card source would have said "clean" and stopped there.

**The page header is not clean.** `InspectionSharePage` renders its black header — the SuperTransport logo image, the wordmark "SUPERTRANSPORT", and "Roadside Document Viewer" — in *every* state, including throttled. So an unauthenticated URL that has just confirmed the token is live also names the carrier and says the link is a document viewer. That is exactly the pairing to avoid: liveness confirmation plus attribution.

Nuance worth keeping: the header is correct on the `ok` state (an officer needs to know whose documents these are) and harmless on `Document Not Found`, which confirms nothing. Only the throttled state pairs a live-token signal with carrier attribution.

Fix:

- Render the throttled state with neutral chrome: no logo, no wordmark, no "Roadside Document Viewer", no "Secure Link" badge.
- Keep the card copy as-is — it names nothing and it is actionable.
- Confirm (not assume) the `officer-packet-download` 429 body is equally nameless.
- Assert the throttled render contains none of: carrier name, "Roadside Document Viewer", the token, or any document field.

## 2. Pass B §9 — verification sweep, 25 criteria

Run as verification, not attestation. For each criterion: **what was observed, where, and by what method** — file and line, test name and result, query and rows returned, or rendered text. Anything I cannot observe is reported *unverified* with the reason, never marked pass. Three specified controls in this stage turned out never to have shipped; the sweep assumes more exist.

Every criterion carries an explicit evidence class, and the document keeps them apart:

- **verified-by-exercise** — the behaviour was driven and its output observed.
- **verified-by-catalog** — the shipped definition, grant, policy or stored object was read and matched; the behaviour itself was not driven.
- **unverified** — with the reason.

Method per group:

- **Offline (8)** — Playwright with the context offline, driving certify / report-malfunction / upload-ELD-document / officer-email for real, plus Dexie store reads after each. Rendered text and store contents, not source reading. *Exercise.*
- **Sync (6)** — drain a seeded queue for real and record actual execution order, upload concurrency, and RPC serialisation. Idempotent replay run twice with the same token. *Exercise.*
- **Rejection (2)** — force a guard rejection and a duplicate-date unique violation, then **assert the rendered surface**: the Management notification bell's Action tab shows the item, read as rendered text. A `notifications` row whose type nothing renders is the missing-edge-function failure one layer later, so the row is necessary evidence and not sufficient evidence. Both are recorded. *Exercise.*
- **Parity (1)** — run the 17-fixture suite; quote fixture 17's asymmetry comment verbatim. *Exercise.*
- **Delivery (5)** — **verified-by-catalog, all five.** Function bodies, grants, policies, Storage object metadata and existing access-log rows are read; the throttle counter and token resolution are *not* driven. The near-miss in `docs/eld-officer-packet-sharing.md` stands: no test writes to `share_token_access_log`, `share_tokens` or `officer_packet_links`. The document states plainly that these five rest on read evidence and what would be needed to raise them to exercise (a seeded non-production token on a throwaway resource).
- **Regression (3)** — repository-wide scans plus the `/roadside` import-graph assertion re-derived from scratch. *Exercise.*

### The five I expect to find something

Called out now so a clean result means something.

1. **Dependency ordering under a real drain.** Nothing has yet drained a queue holding a full dependent chain alongside concurrent byte uploads. Ordering is currently believed correct from reading `queue/runner.ts`.
2. **`certify_rods_day` only after its uploads succeed.** Same drain, asserted on observed call order.
3. **Rejection path Management notification.** Written before alert delivery worked end to end, so it has never run with delivery live. Checked at the bell, not at the table.
4. **`/roadside` import graph.** Asserted before the queue, HEIC, officer-packet and throttling work landed.
5. **What `/roadside` actually draws now.** `display_document_path`, `display_bytes`, the probe-on-hydration change and the packet builder all landed after the roadside assertions were last exercised end to end. The import graph is one check; the rendered screen is another, and neither of these three has been seen since:
   - a **converted (HEIC→JPEG) day** — does the day view draw the display copy, and is the tile labelled "On file (ELD log)";
   - a **flagged (`sync_rejected`) day** — still present in the packet, still no officer-facing rejection label;
   - a **day with a live officer link** — the packet renders and the Email-to-officer path is reachable without pulling pdf-lib or Supabase into the graph.

   Evidence is screenshots plus rendered text from `/roadside` with each state seeded into Dexie.

Deliverable: `docs/eld-pass-b-acceptance-2026-08-01.md` — one entry per criterion with observation, evidence and evidence class; a findings section for failures and unverifiables; and §9 criteria 4 and 5 (installed cold launch on real iOS and Android hardware) restated as still-open deployment blockers that cannot be verified from here.

## Technical notes

- The throttled-chrome change is presentation-only in `src/pages/InspectionSharePage.tsx`; no resolver, migration, or grant changes.
- The sweep creates no share tokens and no access-log rows.
- Any criterion that turns out never to have shipped is written up as a finding in the same voice as the §7 throttling finding, not quietly fixed inside the sweep.
