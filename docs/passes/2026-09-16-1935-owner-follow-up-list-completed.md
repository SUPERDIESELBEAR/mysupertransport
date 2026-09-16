# Pass report — owner follow-up list completed

Date: 2026-09-16 19:35 UTC (14:35 Chicago)
Mode: BUILD, documentation only.
Files changed: `docs/tms-wish-list.md`, and this report.
No migrations, no code, no test changes, no data changes. No write probes were run.

Predecessor: `docs/passes/2026-09-16-1912-owner-follow-up-list.md`, whose prompt was
truncated at "Flag for correction; give the". This pass supplies the missing
remainder as the owner has now stated it.

---

## Contradiction check

No item in the prompt contradicts the record, with two exceptions handled by
recording the record's version rather than the prompt's assertion:

1. **"Module 7 passes 5 and 6, blocked."** The record names a blocker for
   **Pass 5** only: the open decision at "OPEN DECISION, unresolved, Module 7
   Pass 5" inside "Module 5, Pass 4 — the late accessorial adjustment path
   (`-A1`)" — `invoices_load_key UNIQUE (load_id)` forbids a second invoice row
   per load, so the supplemental container is either a `supplemental_invoices`
   table or a relaxed constraint, and the proposal deliberately did not choose.
   The record contains **no Module 7 Pass 6 entry and no Pass 6 blocker**;
   delivered Module 7 work stops at Pass 3 ("Module 7 (Billing & Invoicing),
   Pass 3 — persistence, numbering, the queue (2026-09-04)",
   `docs/tms-build-status.md` line 7199). Nothing was invented; the wish-list
   line says so explicitly.

2. **"13-step cutover purge."** Not a contradiction — CONFIRMED. The record's
   subsection reads "3. The thirteen ordered steps, and why each sits where it
   does", under "Cutover purge procedure — authoritative, execute on cutover
   day" (`docs/tms-build-status.md` line 1343).

---

## Line numbers confirmed (item 1)

Live grep of `docs/tms-build-status.md` for `CROSS-CARRIER ISOLATION REMAINS UNPROVEN`:

```
14000:CROSS-CARRIER ISOLATION REMAINS UNPROVEN. One real carrier exists; every probe
14083:CROSS-CARRIER ISOLATION REMAINS UNPROVEN. One carrier exists.
14681:"CROSS-CARRIER ISOLATION REMAINS UNPROVEN", which reads as built-but-untested.
```

- The reviewer's **14000** and **14083** are CONFIRMED, unchanged.
- A **third** occurrence exists at **14681**. It is not a claim: it is the census
  entry quoting the wording in order to correct it. Recorded in the wish-list line
  so a later reader does not "fix" it.

Both numbers, and the note about 14681, were written into the VERIFICATION GAPS
item. The record lines themselves were NOT edited in this pass.

---

## Changes written to `docs/tms-wish-list.md`

Item 1 — line numbers added to the "CROSS-CARRIER ISOLATION REMAINS UNPROVEN"
VERIFICATION GAPS item (14000, 14083, plus the 14681 note).

Item 2 — new VERIFICATION GAPS line:
"The census classifier counted role-AND-author policies (e.g. `broker_notes`
author update/delete) as ROLE-ONLY, so 123 is a slight over-count."
Pointer: `docs/passes/2026-09-16-1840-read-enforcement-census.md`, the
classification section.

Item 3 — new group **PARKED — named here so the follow-up list is complete; the
detail lives elsewhere**, five lines (below).

Item 4 — the OWNER DECISIONS OWED line "How to close read enforcement" was left in
place, in position, with the appended text:
"DECIDED 2026-09-16, restrictive policy per table; to be recorded by the precheck
pass." It is not moved and not removed; that happens when the record shows it.

Item 5 — duplicate sweep, below.

---

## Every pointer written

| Item | Pointer written |
|---|---|
| Isolation wording | `docs/tms-build-status.md` lines 14000, 14083 (+14681 as a quotation, not a claim); record 2026-09-16 census entry, section (c), "The correction this census forces" |
| Classifier over-count | `docs/passes/2026-09-16-1840-read-enforcement-census.md`, classification section |
| Fictitious company | record 2026-09-13 — "Decision: the fictitious company gets drivers by walking two or three demo drivers through onboarding by hand" (line 12224); plus the PREREQUISITES line "No path creates carrier #2 with an owner and a membership"; related-not-duplicate: wish-list "Demo / training environment" |
| Module 9 reporting | wish-list "Mileage engine", "Driver revenue report period basis (Module 9)", "Per-dispatcher revenue attribution (Module 9)", "Dispatch managers are indistinguishable in the data", "Financial Intelligence token protection", "Fuel reporting (Module 9)" |
| Module 7 Pass 5 blocker | record — "OPEN DECISION, unresolved, Module 7 Pass 5" inside "Module 5, Pass 4 — the late accessorial adjustment path (`-A1`)" (lines 2888–2893); delivered work stops at Pass 3 (line 7199); related wish-list entries "Queue views over loads (Module 7 and later)", "Factoring payout reconciliation (Module 7)", "Late accessorial adjustments — the `-A1` path" |
| Deactivation / lease termination | wish-list "A device type is defined in THREE places" (its TRIGGER names the queued deactivation and lease-termination work) and "Storage objects leak whenever a row is deleted by any route but the app" |
| 13-step cutover purge | record "Cutover purge procedure — authoritative, execute on cutover day" (line 1343), subsection "3. The thirteen ordered steps…"; warning at line 2361 |
| Read-enforcement decision | record 2026-09-16 census entry, section (d); marked DECIDED, to be recorded by the precheck pass |

---

## Every duplicate found (item 5)

Existing wish-list entries were checked against each follow-up item. Where an item
already existed, the new line POINTS at it and no second copy was written.

1. **Module 9 reporting** — already present six times, as separate open questions:
   "Mileage engine" (RPM, lines 77–93), "Driver revenue report period basis
   (Module 9)" (236), "Per-dispatcher revenue attribution (Module 9)" (246),
   "Dispatch managers are indistinguishable in the data" (262), "Financial
   Intelligence token protection" (271), "Fuel reporting (Module 9)" (611).
   No new Module 9 entry created.
2. **Deactivation and lease termination** — already present inside "A device type
   is defined in THREE places" (TRIGGER: "do it as part of the queued deactivation
   and lease-termination work, not before") and "Storage objects leak whenever a
   row is deleted by any route but the app" (ica-signatures / DeactivationWizard
   delete paths). No new entry created.
3. **Module 7** — three existing entries touch it: "Queue views over loads
   (Module 7 and later)", "Factoring payout reconciliation (Module 7)", "Late
   accessorial adjustments — the `-A1` path" (which itself records that the design
   MOVED to Module 5 Pass 4 and that Pass 5 remains the supplemental-invoice
   seam). Pointed at; not restated.
4. **Fictitious company** — NOT a duplicate. "Demo / training environment" is a
   different item (isolation of demo data, and it explicitly says not to build a
   second mechanism alongside `operators.is_demo`). Recorded as related, and the
   difference stated, so the two are not merged by a later reader.
5. **13-step cutover purge** — no wish-list duplicate. It lives in the record only.
6. **Read-enforcement closure strategy** — no duplicate; the single OWNER
   DECISIONS OWED line was annotated in place.

---

## What this pass did NOT do

- Did not edit `docs/tms-build-status.md`. The restrictive-policy decision is
  recorded there by the precheck pass, not here.
- Did not edit lines 14000 / 14083. They stay as written; the correction is
  appended elsewhere in the record and flagged in the wish list.
- Did not verify any live database fact. Every number reused here (148 / 12 / 123,
  zero restrictive policies) is cited from the 2026-09-16 census, not re-measured.
- Did not assert a Module 7 Pass 6 blocker, because the record has none.
