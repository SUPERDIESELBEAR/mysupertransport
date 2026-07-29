# Stage 1 — ELD Malfunction Reporting & Paper Readiness (revised)

Manual record-keeping support used only when a driver's registered ELD has malfunctioned (49 CFR 395.34). No HOS math, no countdowns, no telematics.

**Verified:** the project runs **PostgreSQL 17.6**, so `UNIQUE NULLS NOT DISTINCT` is supported. No `COALESCE(day_number, -1)` or generated-column workaround is needed.

**Wording rule (narrowed):** SUPERDRIVE must never describe *itself* or this feature as an ELD, e-log, or logging device. Referring to the driver's own malfunctioning ELD as an ELD is accurate and required. Driver nav item: **ELD Malfunction**. Management nav item: **ELD Malfunctions**.

**Confirmed:** the Onboard Systems seed (`equipment_assignments` / `equipment_items`) is read **only at report time**. Values are copied into `eld_malfunction_events` as literal snapshot columns; nothing joins live equipment data at display time. A later reassignment or serial change cannot alter a past malfunction record.

## 1. Database

New tables (uuid PK, created_at/updated_at, GRANTs + RLS on each):

- **eld_device_models** — provider_name, device_make, device_model, fmcsa_registration_id, support_phone, is_active. **Seeded in this stage** with at least one row per hardware model in the fleet so Step 2 never dead-ends.
- **eld_devices** — operator_id, truck_number, eld_device_model_id FK, serial_number (encrypted at rest), is_active. Seeded from Onboard Systems where available; overridable.
- **eld_malfunction_events** — operator_id, eld_device_id, discovered_at, discovered_location, malfunction_code (P/E/T/L/R/S/O), malfunction_description, driver_notes, hinders_hos_recording, backdate_reason, repair_deadline, status, resolved_at, resolution_notes, carrier_acknowledged_at/_by, plus:
  - frozen snapshot: device_provider, device_make, device_model, device_serial, eld_registration_id
  - delivery: notice_pdf_path, `notice_generated_at`, `notice_uploaded_at`, `notice_sent_at`, `notice_send_attempts int not null default 0`, `notice_last_send_error text`
  - suppression: `escalations_suppressed_at timestamptz`, `escalations_suppressed_by uuid REFERENCES public.profiles(id)`, `escalations_suppressed_reason text`, `escalations_suppressed_until date`
- **eld_malfunction_notifications** — `event_id uuid NULL`, `notification_type` (`escalation_day` | `ack_overdue` | `digest` | `extension_prompt`), `day_number int NULL` storing the literal elapsed day (9, 10, 11 …) not a bucket, recipient_user_id, channel, `sent_on date`.
- **carrier_notification_settings** — Management-editable list of carrier safety notification recipients. No hardcoded address in code. Seeded with `marc@mysupertransport.com` plus a backup.
- **blank_log_acknowledgments** — operator_id, quarter_key, sheets_confirmed; unique (operator_id, quarter_key).

### De-duplication

Per-event types keep the composite constraint:
```sql
UNIQUE NULLS NOT DISTINCT
  (event_id, recipient_user_id, notification_type, day_number, channel, sent_on)
```
Digests are event-independent — one row per recipient per day with `event_id = NULL`, guarded by a partial index:
```sql
CREATE UNIQUE INDEX ON eld_malfunction_notifications (recipient_user_id, sent_on)
  WHERE notification_type = 'digest';
```
**Verification:** two identical digest inserts on the same date — the second must be rejected; likewise two identical `escalation_day` rows for the same event/day/channel.

### RLS

- Operators: SELECT own events; INSERT own events; **UPDATE limited to `driver_notes` only**. A BEFORE UPDATE trigger raises if a non-staff actor changes any other column — `discovered_at`, `discovered_location`, `malfunction_code`, `malfunction_description`, `hinders_hos_recording`, and all frozen snapshot columns are immutable once the event exists, because they are the basis of a federal notice. Enforced at the trigger/RLS level, not only in the UI. If a driver reports something incorrectly, Management resolves the event with a note and the driver files a new one.
- Onboarding staff: read-all. Dispatchers: read-all + acknowledge. Management: full read, acknowledge/resolve/close/suppress, CRUD on devices, models, settings. No DELETE policy on events for anyone.

## 2. Report wizard (driver)

1. **When & where** — datetime defaulting to now; backdating up to 48h requires a written reason; city + state; optional reverse-geocode to text only.
2. **Which device** — prefilled from eld_devices as a "Confirm these details" state; if unlinked, driver picks from eld_device_models.
3. **What happened** — code picker with plain-English labels, required description, HOS-recording radio. **No** → create event, notify carrier, show explainer. **Yes** → continue.
4. **Review & sign** — full notice text; e-signature via the existing ICA component. On submit: insert event with frozen device values, repair_deadline = discovered_at + 8 days, generate PDF client-side, upload + request send, in-app notify every Management and Dispatcher user, route to dashboard.

## 3. Notice PDF — one shared module

`renderMalfunctionNotice` is a single **pdf-lib** module callable from both browser and Deno. Generated **client-side on submit** so an offline driver can still produce the notice; the same module runs server-side when Management acknowledges, to regenerate with the acknowledgment block filled. No separate edge-function-only generator.

Contents: SUPERTRANSPORT, LLC · USDOT 2309365 · MC 788425; driver name/ID/truck; discovery date/time with timezone; location; frozen provider/make/model/serial/registration ID; code and description; the 395.34(a)(1) statement; (a)(2)–(3) when hinders_hos_recording; signature image and submission timestamp; Carrier Acknowledgment block. US Letter portrait.

## 4. Delivery reconciliation — two distinct failure modes

**Client responsibility.** On submit and again on every app foreground until `notice_uploaded_at` is set: upload the PDF bytes and signature image to Storage, set `notice_uploaded_at`, then request the send.

**Server responsibility.** The hourly job retries email **only** where `notice_uploaded_at IS NOT NULL AND notice_sent_at IS NULL`. It must never attempt to email an event whose PDF is not in Storage. Each attempt increments `notice_send_attempts` and records `notice_last_send_error`. `notice_sent_at` is set only on confirmed delivery to at least one carrier recipient.

**Driver-facing copy — three explicit states:**
- not uploaded → "Notice saved on this device — will send when you have signal"
- uploaded, not sent → "Notice received by SUPERDRIVE — delivering to carrier"
- sent → "Notice delivered to carrier"

Never show unqualified success while `notice_sent_at` is null.

**Management escalations:**
- `notice_generated_at` older than 24h with `notice_uploaded_at` still null → in-app high priority: a driver has been out of contact with an unreported malfunction.
- 3 failed send attempts → in-app high priority: the 8-day clock never started on the carrier side.

## 5. Driver dashboard & 8-day clock

- Clock: "Day 3 of 8 — repair deadline Aug 4, 2026". Gold #C9A84C days 1–5, amber #E08A2E days 6–7, red #C0392B day 8, red + blocking notice day 9+.
- Global non-dismissible red bar app-wide while any event is open.
- Cards: malfunction summary, delivery state (three states above), open notice PDF, carrier acknowledgment status, print blank log sheets, "Report Repair Complete" (Management performs the resolve).

## 6. Escalations — hourly job, per-driver local time

Runs **hourly**, evaluating each driver's stored **home terminal timezone** for the 07:00–21:00 driver send window. No hardcoded Central. Management sends are not time-restricted.

| Elapsed day | Management + Dispatch | Driver |
|---|---|---|
| 3 | in-app + email — extension prompt | — |
| 5, 6 | in-app only | none (banner covers it) |
| 7 | in-app + email | in-app |
| 8 | in-app + email, high priority | in-app + email |
| 9, 10, 11 … | in-app + email, high priority, one per literal day until resolved or extension granted | blocking notice only |

**Day 3 copy:** instructs Management to file the extension request **directly with the FMCSA State Division Administrator**. No link to an in-app generator — that does not exist until Stage 4.

Also: `ack_overdue` if no Management/Dispatcher acknowledges within 24h of submission; a daily Management `digest` listing every open event with driver, truck, day N of 8, delivery state, and extension status.

### Suppression (expiring)

Management's "Pause escalations" action requires a written reason and writes `escalations_suppressed_at/_by/_reason` plus `escalations_suppressed_until`, which is **required** and **capped at 7 days** from the suppression date. It stops day 9+ repeats only; the driver's blocking notice stays in place. `ack_overdue` can **never** be suppressed. Once `escalations_suppressed_until` passes, the hourly job resumes escalations automatically and notifies Management that the pause has lapsed. Re-suppressing requires a fresh written reason. The Management list displays the suppression badge, reason, and expiry prominently — a visible state, not a way to quietly hide an overdue repair.

## 7. Paper readiness

- Add **pdf-lib**; build `renderDutyStatusGrid` as a shared renderer taking an optional duty-status segment array — blank here, reused in Stage 2. Grid per 49 CFR 395.8(g): four labeled status lines, 24 one-hour increments, Midnight/Noon labels, total-hours column, REMARKS area, RECAP block. Pre-print static carrier data only; dates blank. Footer "Form rev. 2026.1". 8 pages, US Letter portrait.
- Instruction sheet ("What To Do If Your ELD Fails") in the Document Hub.
- Quarterly acknowledgment via the Document Hub read-and-acknowledge mechanism: "I confirm I have at least 8 days of blank log sheets in my truck."

## 8. Navigation & Management views

- Driver nav: **ELD Malfunction** with a warning-triangle icon. Pre-flight state shows Report button, Blank Log Sheets card, instruction sheet, paper-supply reminder, acknowledgment status. Active state swaps to the dashboard.
- Management nav: **ELD Malfunctions** — list of events (driver, truck, day N of 8, status, notice delivery state, acknowledgment, suppression badge + reason + expiry, blank-log acknowledgment) with acknowledge / resolve / close / pause-escalations actions.
- Management: **Device Data Quality** panel flagging any `eld_devices` row with a missing or malformed serial (empty, too short, placeholder text, non-conforming characters) — serials were hand-entered in Onboard Systems. Inline editable.
- Management: carrier notification recipient editor.

## Technical notes

- Reuses existing auth role helpers, RLS predicates, notification service, Document Hub storage/versioning/acknowledgment, ICA signature capture, in-app PDF viewer.
- Malfunction screens use inline hardcoded hex values per spec §8.
- New dependency: pdf-lib (jspdf stays for existing generators).

## Not in this stage

Digital duty-status entry, offline/PWA caching, roadside presentation mode, extension request generator, retention archive, any HOS calculation.
