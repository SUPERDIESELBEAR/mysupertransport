# Compliance Summary — Phased Improvements

18 of 19 recommendations (skipping #18 keyboard shortcuts), grouped into 3 independently shippable phases. Each phase is reviewable on its own and safe to pause between.

## Recommended auto-reminder cadence (#7)

Low-noise, deadline-aware. One email per driver per cert per day max (dedupe key), quiet hours respected.

- **45 days out** — single "heads-up" email. Plenty of runway, no urgency styling.
- **14 days out** — "renewal window open" email.
- **3 days out** — "urgent" email, red styling.
- **Day of expiry** — "expires today" email.
- **+1 day expired** — "expired, off-duty risk" email to driver + cc onboarding staff.
- After that: weekly until resolved, capped at 4 follow-ups.

Sent 9:00 AM US Central. Skipped if a manual reminder already went out in the last 48 h. Operator can mute a specific cert reminder from the email footer (#14 surfaces the same toggle in-app).

---

## Phase A — Actionable UX (ship first)

Frontend-only or thin DB additions. No migrations that change existing semantics.

1. **#1 Last-updated line** under each cert sub-row: `Updated by Jane Doe, 3d ago` (reads `audit_log` written by the trigger landed last round).
2. **#2 "Remind driver" button** per critical/expired cert. Calls existing `send-cert-reminder` edge function. Disabled + tooltip while in 60-min cooldown (reuses `useBulkReminderCooldown`).
3. **#3 Sort / grouping toggle**: `By urgency` (default) · `By driver A–Z` · `By doc type`. Persisted in `localStorage`.
4. **#4 Inline "Renew" date editor** per driver cert — popover with `DateInput`, writes to `inspection_documents.expires_at`; trigger handles audit.
5. **#5 CSV export** button (visible rows respect current filter + sort).
6. **#10 IRP per-driver** added back into the summary view.
7. **#12 Block past dates** in the renewal date picker (validation + helper text).
8. **#19 Color-blind audit**: verify status colors meet WCAG and re-test palette; pair every color with the Lucide icon set landed last round.
9. **#20 Intentional empty/loading states** (skeleton rows, "All compliant" zero-state with gold check, "No data yet" first-run state).

## Phase B — Operations & data integrity

Adds the cron job, the renewal upload flow, and tightens data sources.

10. **#6 Inline renewal upload flow** — "Upload renewal" action opens a small uploader, writes the new file to `inspection_documents` + bumps `expires_at` atomically. Audit trigger fires automatically.
11. **#7 Automated reminder cadence** — new edge function `cron-cert-reminders` + pg_cron job (cadence above). Idempotent via `cert_reminders` dedupe key `operator_id + doc_type + threshold + sent_on (date)`.
12. **#8 Compliance score tile** on the Overview tab: % compliant, # expired, # critical, # warning. Reads `v_compliance_items` so it's free server-side.
13. **#9 Trend sparkline** per driver — last 6 months of `audit_log` expiry changes rendered as a tiny inline chart in the driver row header.
14. **#11 Drop `applications.cdl_expiration` fallback** project-wide. Search every reader, swap to `v_compliance_items` / `inspection_documents`. The sync trigger from the last round means writes still flow safely.
15. **#13 "Stale data" warning** — if `expires_at` was bumped but no new file uploaded within 24 h, show a small amber chip on that cert sub-row.

## Phase C — Notifications, reporting, audit

16. **#14 Per-driver notification preferences** — extend `notification_preferences` with cert-reminder toggles (per doc type + cadence opt-out). Surfaced in the operator portal and from the auto-reminder email footer.
17. **#16 Filtered audit history** — "View history" link on each cert sub-row deep-links to the audit log filtered to that `inspection_doc_id`.
18. **#17 Per-driver compliance timeline** — full vertical timeline modal showing every expiry change, upload, reminder sent, and manual edit for one driver.

> Skipped per your call: **#15 Management digest email** (revisit later) and **#18 keyboard shortcuts**.

---

## Technical notes

- All new server reads use `v_compliance_items` (built last round) — no parallel status logic in the client.
- Audit writes everywhere route through the `log_inspection_expiry_change` trigger — never client inserts.
- New edge function `cron-cert-reminders` follows the existing `send-cert-reminder` pattern (Resend, `getClaims` not needed because it's cron-invoked with service role).
- `cert_reminders` gains a dedupe unique index `(operator_id, doc_type, threshold, sent_on::date)` so a retried cron run can't double-send.
- Sparkline (#9) uses inline SVG, no chart lib.
- CSV export (#5) is pure client-side; no new endpoint.
- Phase B migrations land in one batch (drop fallback + stale-data view column + dedupe index); Phase A and C are code-only.

## Out of scope

- Management digest email (#15) — deferred.
- Keyboard shortcuts (#18) — declined.
- Anything outside the Compliance Summary surface and the few cross-component readers touched by #11.
