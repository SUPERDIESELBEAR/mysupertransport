# §6 — Retention Archive

A staff screen that finds every retained duty-status and malfunction artifact, exports it as a combined PDF, and writes an audit record for every export. Nothing is ever auto-deleted; the only removal path stays the existing audited admin purge.

## What I verified first (not assumed)

**Demo flags — the ones added since the guardrails shipped do not all carry one.** Queried directly:

| Carries `is_demo` | Does not |
| --- | --- |
| `rods_days`, `eld_malfunction_events`, `eld_extension_requests`, `rods_correction_requests` | `rods_events`, `rods_amendments`, `rods_unlock_events`, `eld_malfunction_notifications`, `officer_packet_links`, `share_tokens`, `share_token_access_log` |

Every flagless table except the two share-token tables reaches a flag with no extra join beyond what the query already walks: `rods_events` and `rods_amendments` hang off `rods_days`; `eld_malfunction_notifications` off `eld_malfunction_events`; `rods_unlock_events` and `officer_packet_links` carry `operator_id`, and `operators.is_demo` exists.

`share_tokens` is the exception: polymorphic (`scope`, `resource_id`), no `operator_id`, and the only scope in use today is `inspection_document` — so no officer-packet share-token access log is reachable by operator right now. `officer_packet_links` does carry `operator_id` and does FK `share_tokens.token`, so the join exists in that direction.

**Other facts.** The fixpoint loop lives only in `reset-demo-driver/index.ts:39-75` — not shared. `RodsAdminLogsPanel.tsx:119` is a one-level reverse-map walk, so on `original ← A1 ← A2` it already shows staff an incomplete chain — fixed in this change, not worked around. `audit_log` is `(actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata jsonb)`; `purge_rods_day` is the template for an explicit staff-action insert. `rods_days` is currently empty — the verification chain has to be created through the app.

## Scope

1. **Shared chain helper.** Extract the fixpoint loop into `supabase/functions/_shared/eld/amendmentChain.ts`, with `orderVersions()` returning every version of a `(operator, log_date)` in supersession order, original first. Three callers from day one: `reset-demo-driver` (purge ordering), the export, and `RodsAdminLogsPanel`. Display and export read the same function, so they cannot diverge. Unit tests cover a three-deep chain, a branch, and the cycle guard.
2. **Fix `RodsAdminLogsPanel`.** Replace the reverse-map at `:119` with `orderVersions()` and render the full chain in order, so the panel that ships today stops hiding intermediate amendments.
3. **Demo reachability fix.** Migration adds `operator_id` to `share_token_access_log`, backfilled through `officer_packet_links`, nullable for pre-existing `inspection_document` rows. No change to token issuance or redemption.
4. **Search.** `search_retention_archive` SECURITY DEFINER RPC (management/owner) taking driver, date range, truck number, malfunction event, status, and `_include_demo boolean DEFAULT false`. `is_demo = false` is the default predicate; demo records require explicit opt-in, and the opt-in is recorded on the export.
5. **Export — combined PDF only.** New `export-retention-archive` edge function (`requireStaff(['management','owner'])`): resolves the artifact set, orders each date's versions through `orderVersions()`, merges with pdf-lib (the `buildOfficerPacket` merge pattern, not its downsampling), writes the audit row **before** returning bytes — action `rods_retention_export`, metadata carrying actor, drivers, date range, artifact counts, and `include_demo` — and stores the artifact at `eld-notices/<operator_id>/retention-exports/<export_id>.pdf`. No ZIP, no new dependency.
6. **Compliance timeline (§6.3).** `get_eld_compliance_timeline(event_id)` returning one ordered stream: discovered → notice generated → uploaded → sent → carrier acknowledged → each day certified with its amendments in supersession sequence → each authorized unlock with reason → extension filed → FMCSA response → resolved. Own panel, exports standalone, own audit action.
7. **UI.** `RetentionArchivePanel.tsx` behind a new `eld-retention` view in `ManagementPortal` (`ManagementView`, `ALLOWED_VIEWS`, sidebar beside the two existing ELD entries). Filters, results grouped by driver and date showing every version in order, an "Include demo records" toggle off by default that visibly flags the export when on, and a range export control modelled on `DriverHistoryDownloadPopover`.
8. **No auto-delete.** No TTL, no scheduled sweep. The only removal affordance links to the existing `purge-rods-day` flow.

## Size ceiling — and why downsampling is not the answer

`buildOfficerPacket` solves size by progressively downsampling embedded photos under a ~12–15 MB cap, because an officer's roadside copy is a convenience artifact. A retention export is the federal record itself, so **nothing is ever recompressed, downsampled, or dropped to fit**. The export either contains the artifact at full fidelity or it does not run.

Rough magnitudes (estimate — there are no stored RODS PDFs to measure against right now, so I will measure real sizes during verification and tune the constants): a certified day PDF is on the order of 200–400 KB, more when a scanned source document or photos are attached. One driver-year lands near 100 MB; a 20-driver fleet-year is in the gigabytes. That is past what a single pdf-lib merge can hold in an edge function's memory, and past what a browser will reliably download as one file.

Behaviour at the boundary:

- **Soft ceiling, ~40 MB per output document.** When the resolved set exceeds it, the export splits into sequential parts — "Part 1 of N", each with a cover page naming the driver, the covered date range, and the part number. Splits only ever fall on a driver or whole-date boundary, never inside a date's amendment chain, so no version is ever separated from the chain it belongs to.
- **Hard ceiling on the request, not the file.** Above a configured artifact count (initial value tuned from measured sizes during verification), the function refuses with a clear message naming the resolved size and asking the user to narrow by driver or date range, rather than timing out mid-merge and producing a truncated record.
- One audit row per export request, listing every part it produced — a split is one audited export, not N.

## §0.2 treatment

Same handling as §4 and §5: explicit grants beside the table change, RLS scoped to management/owner, `SET search_path` on every definer function, new rejection SQLSTATEs allocated in a fresh P0120+ block and registered in `queue/types.ts`, and nothing asserting a rejection until it has been observed verbatim over PostgREST from a real session. Demo exports carry the existing `drawDemoWatermark`.

## Verification through the app

Create `original ← A1 ← A2` for one date on the demo driver through the driver PWA (certify, amend with a written reason, amend the amendment), then from a management session:

- confirm `RodsAdminLogsPanel` now shows all three versions in order — the panel's current defect, reproduced before the fix and gone after;
- run the search and confirm all three versions appear for that date, in supersession order;
- export the range and confirm the combined PDF contains all three versions of that date in the same order — the check a one-level walk fails;
- measure the real per-day PDF size from that export and set the split and refusal constants from it;
- confirm the default export contains zero demo rows, and the opt-in export contains them and records `include_demo` in the audit row;
- read back the `audit_log` row and confirm actor, range, timestamp, parts, and `include_demo`;
- export the compliance timeline for the demo malfunction event and confirm every stage from discovered through resolved is present and ordered.

## Technical notes

- The export runs server-side so the audit write and the demo predicate cannot be skipped by a client that simply doesn't call them.
- §8 divergence records are not built yet; the artifact registry is shaped so adding them is one entry, not a rewrite.
- ZIP stays out until a real request appears; if it lands, it slots behind the same registry and audit path.
