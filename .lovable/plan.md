## Reconciliation finding (unchanged, reported from the code)

**`eld_malfunction_events.extension_granted_at` is authoritative today; `eld_extension_requests` does not exist.** `rg` finds no reference to the table anywhere and it is absent from the live schema. The ladder's stop condition is `extensionHolds()` in `supabase/functions/_shared/eld/escalationLadder.ts` (144-147) — `if (!event.extension_granted_at) return false;`, with `extension_expires_on` only bounding the hold; its comment names that column as "the single field both sides read". The same column drives the day-3 prompt (227), `ELDMalfunctionDashboard.tsx` (34) and `ClocksStrip.tsx`. The console modal (`ELDMalfunctionsPanel.tsx` 228-240) stamps requested/granted/granted_by/expires/notes in one write from a free-text reason — a grant with no filed request behind it.

So: the generator owns `eld_extension_requests`, the event columns stay as the ladder's cached stop condition written only as a projection, and the console modal shrinks to recording FMCSA's response.

---

## 1. Table `eld_extension_requests`

One row per filing: `event_id`, `operator_id`, `is_demo` (stamped from the operator), `status` (`draft | submitted | granted | denied | withdrawn`), filer `name/title/phone/email`, the carrier snapshot at filing, the frozen device snapshot copied from the event, `repair_actions`, `why_more_than_8_days`, `requested_through`, both clock anchors frozen at filing (`notification_at`, `discovered_at`), `pdf_path`, `submitted_at`, and the response: `response_text`, `response_date`, `fmcsa_conditions`, `granted_through`.

**One open request per event.** Reported as asked: yes, it should be constrained. 395.34(d)(2) doesn't cap attempts, so refile-after-denial must stay open, but two *pending* filings on one event is not a real sequence — it is a duplicate filing, and it makes "what did we ask FMCSA for" unanswerable at roadside. A partial unique index on `(event_id) WHERE status IN ('draft','submitted')` permits the denied → refile sequence (a denied row leaves the predicate) while blocking a second filing alongside a pending one. Terminal rows are unconstrained, so an event can accumulate a full filing history.

§0.2 throughout: RLS on, explicit grants, `policy-grant-parity` coverage, staff write / driver read own submitted-or-later.

## 2. Projection — recomputed from all requests, never from the written row

Correction taken. The trigger does **not** project the row being written. On any insert/update/delete of a request for an event it recomputes the event's extension state as a function of the event's whole request set:

- `extension_granted_at` / `_by` / `extension_expires_on` / `extension_notes` come from the **most recent granted request whose `granted_through` has not passed** (in the home terminal timezone, same `zonedDateKey` the ladder uses).
- Only when no request qualifies are the grant fields cleared.
- `extension_requested_at` is the earliest `submitted_at` on the event.

That makes a denial harmless to a live earlier grant, and makes the outcome independent of the order two rows happen to move through statuses — the recompute reads the same set whichever trigger fires last. Ordering test: grant A, then deny B, then withdraw B, asserting the event's grant fields never flicker.

## 3. The PDF

`_shared/extensionRequestCore.ts` rendered with pdf-lib, mirroring the `malfunctionNoticeCore` split so browser and edge function produce byte-identical output. Contents:

- Addressed to the FMCSA Division Administrator for the State from `carrier_profile.fmcsa_division_state`.
- Carrier legal name, USDOT, MC, principal place of business from `carrier_profile` — no constants in the renderer.
- Filer name, title, phone, email.
- ELD make, model, serial from the event's frozen `device_make` / `device_model` / `device_serial`; the renderer never joins `eld_devices`.
- Date and location the malfunction was reported.
- Repair/replace/service actions; why more than 8 days is needed.
- Signature block: typed representative name, title, date.
- Both clocks side by side — discovery and the driver's written notification, with the resulting filing deadline.
- Demo requests watermarked; no share token minted.

Stored in `eld-notices` under an event-owned path.

## 4. Missing carrier field — a message, not an exception

Correction taken. `carrier_profile` is a seeded singleton and `fmcsa_division_state` is `NOT NULL DEFAULT 'MO'`, so an absent value is unreachable in practice — which is precisely when a raw failure reads as a broken app. Generation still refuses, but the form shows a plain sentence in the same register as `CARRIER_CACHE_MISSING_MESSAGE`: what is missing, why the request can't be produced without it, and where to set it (Management → Carrier Profile), with the generate button disabled rather than throwing. Applies to any required carrier field, not just the state.

## 5. Console

- **Open extension request**: form pre-filled from event + carrier profile, saves a `draft`, previews the PDF, **Mark as filed** → `submitted`.
- Prominent warning past 5 days since `created_at`, using existing `extensionDaysLeft` / `extensionDeadline` — no new clock math.
- **Record FMCSA response** on a submitted request: granted/denied, response date, response text, conditions, granted-through. The only path that can produce a grant; the current direct-write modal is removed.

## 6. Driver dashboard

`submitted` → the filed request with tap-to-open PDF for roadside. `granted` → granted status, through-date, FMCSA conditions, and the day-9 blocking notice gone (already keyed off `extension_granted_at`, now fed only by a recorded response).

## 7. Verification (§9 criteria 9-11), observed not attested

Through the app: generate against a real event whose truck has since been reassigned, read the produced PDF back, confirm every 395.34(d)(2) element and that make/model/serial match the frozen snapshot rather than the current `eld_devices` row. Then the deny-after-grant ordering case, the day-9 suppression flip, the duplicate-pending refusal, and visible demo suppression. Guards run in both directions (§0.1 rule 5).

---

## Technical notes

- Append-only on the request body once `submitted` (filer, carrier, device snapshot, clock anchors, both narrative fields); only response fields and forward status moves are writable. Fresh SQLSTATE block `P0110`+ (next free after the correction-request `P0100`-`P0107`), registered in `REJECTION_SQLSTATES` and the §6 table, each observed verbatim over PostgREST before any fixture asserts it.
- No new clock; `repairClock.ts` and `escalationLadder.ts` remain the single source.
- The event's extension columns stay as a cache rather than being migrated away — ladder, dashboard and clocks strip all read them. The invariant is that the recompute trigger is their only writer.
- Existing manufactured grants will be reported, not backfilled into synthetic requests.
