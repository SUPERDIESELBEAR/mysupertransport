# Demo-mode guardrails for ELD/RODS

Two items resolved first, then the approved build.

---

## Finding: the §6 malfunction escalation ladder was never built

Recorded in its own right, as with the §7 throttling gap. **It is not part of this change and is not built here.**

Stage 1 §6 specified an escalation ladder over an open malfunction: prompts at days 3, 5, 6, 7 and 8, repeats from day 9, an acknowledgement-overdue chase when the carrier has not acknowledged, and a daily digest of open events. The job that fires any of it does not exist.

**What does exist** — the gap is bounded to the sending side, not the data model:

- `public.eld_malfunction_notifications` (migration `20260729230658`) is created, indexed on `(recipient_user_id, sent_on)`, granted, and RLS'd with a staff-select policy. Its `notification_type` CHECK enumerates the entire specified ladder: `escalation_day`, `ack_overdue`, `digest`, `extension_prompt`, `notice_stuck`. It has a `day_number` column. The de-dup table is complete and correct.
- `eld_malfunction_events` carries everything the ladder would read: `repair_deadline`, `carrier_acknowledged_at` / `_by`, `notice_sent_at`, `notice_send_attempts`, `notice_last_send_error`, and `idx_eld_events_pending_send` on `notice_uploaded_at WHERE notice_sent_at IS NULL` — an index built specifically to find stuck notices for a `notice_stuck` prompt.
- The initial notice path works: `send-eld-malfunction-notice` emails `carrier_notification_settings` recipients when the event is first reported.

**What does not exist**, verified by searching every writer of the table and by reading `cron.job` on the live database:

- `eld_malfunction_notifications` has **zero writers**. Nothing in `src/` or `supabase/functions/` inserts into it. Every one of the five `notification_type` values is unreachable — so `ack_overdue` and `digest` are missing too, not just the day ladder.
- No cron entry fires anything malfunction-related. The only hourly ELD job is `rods-certification-reminders`, which reminds the *driver* to certify. It reads open events solely to decide which drivers to nudge; it sends nothing to the office and writes nothing to the escalation table.

**Consequences.** Nobody at the office is told a repair clock is running out — `repair_deadline` is stored and never read by any alerting path, so an event can pass its deadline in silence. And the day-3 `extension_prompt`, the one that tells the carrier to file the FMCSA extension request inside the 5-day window, never fires; missing that window is a compliance failure with no in-app signal that it happened. An unacknowledged notice also chases nobody: `carrier_acknowledged_at` can stay null indefinitely.

This gets its own change. It should be written against the flag added below, so it is demo-aware from day one rather than retrofitted.

---

## Decision: `is_demo` immutability and the exception path

**Can `set-demo-flag` clear the flag on an operator that already has certified logs? Yes, today, with no guard at all.** It loads the operator, writes `is_demo: false` to `operators`, `applications` and `profiles`, and returns. It does not look at `rods_days`, does not check `certified_at`, and does not consult storage. Nothing else in the codebase gates it.

Current state of the data: 2 demo operators, **0 rows in `rods_days` project-wide**, 0 certified. The clean-truncate window is genuinely open — this can be decided cleanly and enforced from now on rather than migrated into.

**Decision: a demo-certified log stays demo permanently, and an operator carrying one is blocked from being cleared to live.**

The reasoning is stronger than the `record_source` analogy. Under this plan a demo-certified day's *artifacts* are watermarked at generation: the stored `pdf_path` bytes and the signature composite have `DEMO — NOT A RECORD OF DUTY STATUS` burned across them. Clearing `rods_days.is_demo` would not unmark those bytes. The result would be a row claiming to be a real §395.8 record whose own PDF says it is not one — worse than either state on its own, and exactly the kind of document that must never be loose. Re-rendering to strip the mark is not available either: the certification signature was collected in a sandbox against a driver who was told nothing counted, so the certification itself is not a real one and cannot be made into one.

So there are three states, and the trigger enforces the boundary rather than blocking a supported workflow:

1. **Demo operator, no certified logs** — the normal case, and what `provision-demo-driver` produces. `set-demo-flag` clears the flag freely. Nothing to launder. This is the path a demo account taking over as a real driver actually uses.
2. **Demo operator with certified logs, going live** — `set-demo-flag` refuses with a 409 naming the count of certified demo days and pointing at the supported route: run `reset-demo-driver`, which purges those rows through `purge-rods-day` with a written reason and an audit row, then clear the flag. The demo records are destroyed, not relabelled. After the purge, case 1 applies.
3. **Reclassifying an existing demo log to real** — not supported, by any path, service-role included. There is no audited override, because there is no honest artifact to hand an officer at the end of it.

`rods_days.is_demo` therefore stays strictly immutable on UPDATE (its own `P00xx` code, `record_source` pattern). `operators.is_demo` is mutable, gated by the certified-log check in `set-demo-flag` **and** by a trigger backstop on `operators` so a future call site cannot bypass it. The refusal is a first-class UI state in the demo console, not a raw error.

Retention export: unaffected. A permanently-demo log is correctly excluded, and the operator's real logs — every one written after the flag cleared — carry `is_demo = false` and export normally. The exclusion is per-log, not per-operator, which is why it belongs on `rods_days`.

---

## 1. Watermark — the flag rides on the record

The roadside surface is offline-only (`roadsideImportGraph.test.ts` bars Supabase from the bundle), so the flag cannot be looked up at render time.

- Migration: `is_demo boolean not null default false` on `rods_days` and `eld_malfunction_events`, stamped BEFORE INSERT from `operators.is_demo`, immutable on UPDATE per the decision above. `is_demo` added to `LocalMeta` and `RoadsideManifest` for the paths with no day row, and to the fields `resolve_officer_packet_token` returns.

Full render enumeration, from source:

| Path | File |
|---|---|
| Certified-day PDF | `src/lib/eld/renderRodsDay.ts` |
| Blank 8-day packet | `src/lib/eld/renderDutyStatusGrid.ts` |
| Malfunction notice (both callers) | `supabase/functions/_shared/malfunctionNoticeCore.ts` — the browser wrapper inherits it |
| Officer packet cover | `buildOfficerPacket.ts` → `addCoverPage` |
| Officer packet placeholders | `buildOfficerPacket.ts` → `addPlaceholderPage` |
| Officer packet image pages | `buildOfficerPacket.ts` → `addImagePage` |
| Merged PDF pages | `buildOfficerPacket.ts` → `assemble`, stamped after `copyPages` and before the size ceiling check |
| Native roadside SVG | `src/components/eld/RoadsideDayRender.tsx` |
| Correction summary PDF | `src/lib/correctionSummaryPdf.ts`, if reachable for a demo operator |

One helper per side: `drawDemoWatermark(page)` for pdf-lib (diagonal, ~45°, repeated across the page, ~0.18 red, drawn last so it crosses grid and signature) and `<DemoWatermark />` for the SVG, same wording and angle. Plus always-on banners on the driver dashboard and the management console, distinct from the `useShowDemo` reveal toggle.

## 2. Outbound suppression — enumerated, each stopped visibly

1. Malfunction notice email — `send-eld-malfunction-notice` → `carrier_notification_settings`.
2. Officer packet email — `send-officer-packet`.
3. Officer packet carrier copy — same function.
4. Sync alerts → bell — `raise_eld_sync_alert` fans a `notifications` row to every management/owner user. Suppressed inside the function: the `eld_sync_alerts` row is still written so the session shows the alert was raised; the `notifications` INSERT is skipped.
5. Certification reminders — `rods-certification-reminders` filters demo operators out of its operator query.
6. Share tokens — `send-officer-packet` inserts `share_tokens` + `officer_packet_links`.

**Demo operators cannot mint share tokens.** A row there is a live unauthenticated URL against production storage, and its opens land in `share_token_access_log` indistinguishable from a real inspection. `send-officer-packet` refuses before the insert and returns the preview; a trigger on `share_tokens` refusing `scope = 'officer_packet'` for a demo-owned resource is the backstop.

Every suppressed send returns `suppressed: true` with the rendered subject, recipients and body preview, shown in a shared `DemoSuppressedSheet`: *"In a live session this would have emailed 2 carrier recipients — here is what they would have received."* Bell suppression surfaces the same way on the alert row.

## 3. Reset — the six gaps

`reset-demo-driver` clears 13 operator-scoped tables and routes RODS through `purge-rods-day`. It misses:

- `notifications` — keyed by `user_id`, so nothing in the loop reaches it.
- `eld_sync_alerts` — has `operator_id`, not in the list.
- `share_tokens` / `officer_packet_links` — existing demo tokens survive and must be revoked.
- `rods_unlock_events` — confirm the `purge_rods_day` cascade covers it; explicit delete if not.
- `eld_malfunction_notifications` — keyed by `event_id`; verify the FK cascades, delete explicitly if not.
- Storage — only the three paths `purge_rods_day` returns are removed; officer packets under `<operator_id>/officer-packets/` and cached notice PDFs are never deleted.

Device-side Dexie is unreachable from the server: reset bumps `demo_reset_at` on the operator and the client wipes its local stores against it on load.

## 4. Retention-export exclusion

Not built. Reachability confirmed: `rods_days.is_demo` sits on the exact table a retention query walks — `where is_demo = false` with no join, opt-in by inverting it. Noted in `docs/eld-officer-packet-sharing.md` beside the purge notes.

## 5. Verification, as a demo driver

Playwright against localhost: report a malfunction, certify a day, build an officer packet. Assert the watermark on every PDF by pixel, on the roadside SVG at 430px, no new `email_send_log` or `notifications` row, no `share_tokens` row, suppression sheets actually rendered, and after reset `rods_days` / `eld_malfunction_events` / `eld_sync_alerts` / `notifications` all at zero for that operator. Also assert `set-demo-flag` refuses while a certified demo day exists and succeeds once purged. Findings go in a run doc beside the Pass B acceptance doc.

## Technical notes

- `rods_days.is_demo` immutability reuses the `record_source` lock shape with a new `P00xx` code; `operators.is_demo` is mutable behind the certified-log guard.
- `demo-email.ts` resolves demo status by `applications.email`; the ELD paths know `operator_id`, so a sibling `isDemoOperator(admin, operatorId)` is added rather than reusing the email lookup.
