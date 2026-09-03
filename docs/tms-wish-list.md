# SUPERDRIVE — Wish List and Parked Decisions

Companion to docs/tms-build-status.md. That file records what is TRUE and what is
DECIDED. This file records what is PARKED.

Every item carries a TRIGGER: what has to become true before it is worth picking
up. An item without a trigger becomes a graveyard entry. Items leave this list by
being promoted into a build pass or by being explicitly killed — and a killed item
stays here, marked killed, so it is not re-litigated.

Last updated: 2026-09-03

---

## PARKED CAPABILITIES

### Per-facility timezone

Freight convention is that appointment times are local to the FACILITY. SUPERDRIVE
now pins everything to the carrier timezone, which is correct while humans on one
clock enter times transcribed from documents. It breaks when a DRIVER records a
time: a driver in Phoenix tapping "arrived" at 08:00 local stores 15:00 UTC, while
an 08:00 appointment stored as carrier-local is 13:00 UTC — he reads two hours
late when he was on time, and that comparison is what a detention conversation
turns on. Natural home is a timezone column on `facilities`, seeded from state
and corrected by hand for the states that straddle zones (TX, FL, TN, KY, IN, ND,
SD, NE, KS, OR, ID, MI), since facilities are a reused registry. No coordinates
exist, so state or ZIP is the only available basis.

TRIGGER: Module 11, driver app check-in.


### Mileage engine
Nothing in SUPERDRIVE can compute distance between two points. `facilities` has no
coordinates, and `load_stops` latitude/longitude are DRIVER CHECK-IN coordinates,
not facility locations. `loads.deadhead_miles` exists but cannot be populated at
parse time, because deadhead is not a property of a load — it depends on where
that driver was previously.

Three known consumers:
  1. Deadhead / empty miles per load (Alvys shows this; see KILLED below)
  2. Chain feasibility as drive time rather than a raw time gap (Module 3, Pass 5)
  3. Revenue per mile — total and loaded RPM (Module 9)

RPM is the one that matters most. It is how carriers judge whether a load was
worth taking, and Module 9 ships without it unless this is solved.

TRIGGER: before Module 9 is specified. Decide then whether SUPERDRIVE computes
mileage, integrates a mileage provider, or ships without RPM deliberately.


### Demo / training environment

A sandboxed area where dummy drivers, rate cons, fuel reports and settlements can
be created freely — for testing, for staff training, and as a sales surface for
SaaS prospects.

The training case is the strongest argument. Nine lease terminations were
generated in error in three weeks by someone who believed the modal was a status
note; a place to click a destructive button and see the consequence without one
is what would have prevented that.

Do NOT build a second mechanism: operators.is_demo already exists and a Demo Mode
item is already in the staff nav. Whatever is built extends that.

The hard part is ISOLATION, not UI. A demo settlement must not reach real
reporting; a demo driver must not receive real email; demo fuel must not
reconcile against a real MultiService invoice. The build context already
anticipates multi-tenancy via company_id on major tables — a demo environment is
arguably the first tenant, and building it that way would exercise the
multi-tenant path before a paying customer does. That argues for building it
after the modules are complete rather than retrofitting isolation later.

TRIGGER: after the module build is complete, and before any SaaS prospect is
given access.

---

## OPEN QUESTIONS — answer before the named module

### Check-in without a load (SaaS)

A driver can arrive at a facility before the load exists in the system —
dispatch books verbally and enters it later. Rare at SUPERTRANSPORT, likely
elsewhere. Arrival and departure write to `load_stops`, which requires a stop to
exist. Nothing in Pass 2 assumes `load_stops` is the ONLY possible source, so an
unattached check-in reconciled later would be additive rather than a rework. The
provenance model already supports it: a reconciled time would be a third source
value alongside `driver_app` and `dispatcher_entry`.

TRIGGER: first SaaS carrier whose dispatch books ahead of entry.

### Detention terms on the rate confirmation (Module 5, later pass)

Industry standard free time is 2 hours; some brokers write 3. Rate cons also
vary on the CLOCK START TRIGGER — scheduled appointment, actual arrival, or gate
check-in are three different moments and can differ by 30–90 minutes. Many cons
carry daily caps ($200–$400) and a notification requirement. When a driver calls
at hour three, the dispatcher should see this load's terms without opening a
PDF. Candidate for parser extraction into structured fields.

TRIGGER: before the detention claim record is built.

### Detention chase queue

Claims are visible only on their own load. A dispatcher chasing detention wants
one list across all loads, oldest first, with claim age. Same shape as the
paperwork chase queue already parked here — both are load-centric queue views
over a driver-centric system.

TRIGGER: after the claim record has been in real use long enough to know what
the chase workflow needs.

### Dispatch company settlement (Module 4)
The dispatch team is ONE 1099 vendor — a separate company, owner plus team, all
carrying @mysupertransport.com addresses and representing themselves as part of
the SUPERTRANSPORT team, dispatching exclusively for SUPERTRANSPORT.

**The rules are no longer open and are NOT restated here.** Section 4 of
"Settlement rules — the authoritative record" in `docs/tms-build-status.md` is
authoritative for all of: which loads enter the base (4.1), which money (4.2), the
100%-and-reimbursement exclusion predicate (4.3), broker chargebacks (4.4),
factoring as a reduction of the base (4.5), attribution (4.6), schema shape (4.7),
the absence of driver-side machinery (4.8), and loadout loads (4.9).

Four questions previously listed here as OPEN — what the 5% applies to, which
month a load belongs to, whether the factoring share is flat or a percentage, and
whether the dispatch company earns on detention — are all ANSWERED there.

Two things this entry previously said that the build status now supersedes:

  - factoring described as a recurring deduction alongside phone service. It is a
    2% REDUCTION OF THE BASE taken before the 5%; there is no recurring factoring
    line. Superseded by section 4.5 of "Settlement rules — the authoritative
    record" in `docs/tms-build-status.md`.
  - "the settlement tables must serve two payee types." Decided otherwise: the
    dispatch settlement gets its OWN tables and `settlements` is not widened. See
    4.7 for the reasoning, which is recorded so it is not relitigated.

    WHY THE REVERSAL, recorded because the distinction matters: the caution was
    NOT mistaken when it was written. It was written BEFORE the driver settlement
    tables existed, when serving two payee types would have cost almost nothing.
    It was then not applied. By the time the dispatch settlement was designed,
    `settlements.operator_id` was NOT NULL with a cascade FK, the immutability
    triggers were live, and a `paid` settlement existed that any migration would
    have to survive. Separate tables is a decision made AGAINST A KNOWN COST, not
    a judgement that the original caution was wrong.

    The lesson worth carrying: a caution recorded and not applied gets more
    expensive with every pass, and the cost is paid by the pass that finally
    reaches it.

What remains true and unsuperseded here:

  - Two deduction kinds: recurring and configured once (phone service, DAT), and
    per-settlement hand-entered (transaction fees, one-off items such as a claim
    or a load not handled properly).
  - One-off deductions must carry a LOAD REFERENCE. "Claim — $400" is unarguable
    six months later; tied to a specific load it defends itself.

TRIGGER: before the dispatch settlement tables are designed (Module 4).

### Driver revenue report period basis (Module 9)
Gross revenue, net revenue, and itemized deductions with totals, over monthly,
yearly, and total-to-date from first load.

OPEN: does it aggregate by settlement PERIOD or by settlement PAYMENT DATE? The
two-week holdback puts those in different months, and a driver's 1099 cares which.

TRIGGER: before the driver revenue report is built.


### Per-dispatcher revenue attribution (Module 9)
TWO dispatcher relationships exist and they give different answers:
  - `loads.dispatcher_id` — who BOOKED the load
  - `active_dispatch.assigned_dispatcher` — whose DRIVER ran it

These diverge exactly when one dispatcher covers for another, which is the case
that matters most. Neither is wrong; they answer different questions (booking
activity vs book-of-business performance). A report built without choosing will
silently pick one and nobody will know which.

Note also: the Loads list filter labelled "All Dispatchers" means the LOAD-level
field. A Dispatch Board filter would mean the DRIVER-level one. Same words,
different data.

TRIGGER: before any per-dispatcher report is built.

### Dispatch managers are indistinguishable in the data
Jack Barney and Yasir Nawaz are dispatch MANAGERS who carry one or two drivers
each. They hold the plain `dispatcher` role in `user_roles`; nothing in the data
distinguishes them from the four dispatchers carrying six to ten.

Any workload or performance report will rank them as the worst dispatchers.

TRIGGER: before per-dispatcher workload or performance reporting (Module 9).

### Financial Intelligence token protection
The build context specifies a separate access key beyond the owner role. This is
an unusual constraint and will shape how the module is structured.

TRIGGER: confirm still wanted before Module 9 is built.

### Reimbursement pay class — payout rule (Module 4)

Single entry. This was previously recorded twice: here, and as "the reimbursement
pay class payout rule" in the Module 4 deferred-items list in
`docs/tms-build-status.md`. Both versions are merged below; nothing is dropped.
The two did not conflict — they differed only in wording and in the module each
named.

It belongs to MODULE 4. The item concerns how a reimbursement is PAID OUT on a
settlement. Module 5 only decides that a charge carries the classification;
Module 7 only bills it. The settlement is where the payout rule has consequence.

Fully designed, deliberately unbuilt pending a formal spec. Design confirmed:

  - driver-funded expenses reimburse at ACTUAL COST, and only to the party who
    spent it;
  - company-funded expenses (Comdata/MultiService) are company revenue;
  - broker overage is company margin;
  - a proof document is required; an unconfirmed driver-funded reimbursement is
    reported as unsettled rather than paid;
  - unsettled lines HOLD while the rest of the settlement proceeds.

Carried from the Module 4 deferred-items entry: the payout rule ships with the
same pass that brings chargebacks with signed authorization attached, the R&M
Deposit statement (running balance, deposits, withdrawals), and the settlement
preview with a driver dispute window.

Related and deliberately kept separate (Module 4 / Phase 2 reimbursement
decision): lumper stays `revenue` at 100% today. Moving lumper to the
`reimbursement` class is an explicit data migration/review step. Do not infer it
from the presence of `lumper_reimbursement_pct`, and do not automatically
reclassify existing lumper charges.

**This deferral has a LIVE FINANCIAL CONSEQUENCE (recorded 2026-09-02).** Because
lumper is `revenue`, the engine's `funding_source !== 'driver'` guard is never
reached and a lumper SUPERTRANSPORT funded on the fuel card is ALSO paid to the
driver in full — the company pays twice, with no warning anywhere in the UI. See
"A company-funded lumper is paid to the driver in full" in the known-debt section
of `docs/tms-build-status.md`. Detention shares the shape (revenue, 100%, NULL
funding) but not the risk: it is earned from the broker and passed through.

TRIGGER: formal spec written, with Module 4 (settlement payout), before the
settlement engine pays a reimbursement line.

### Queue views over loads (Module 7 and later)

The Dispatch Board is DRIVER-centric — one row per driver with chains hanging off
them. Two jobs are LOAD-centric and should not be worked from it:

  - INVOICING: every load at 'ready_to_invoice', oldest first, regardless of
    driver. This is the billing queue in Module 7.
  - PAPERWORK CHASE: every load on a paperwork tail across all drivers, longest
    outstanding first. Currently only visible by scanning driver rows.

Interim: the Loads list status filter serves the invoicing case adequately.

TRIGGER: invoicing queue with Module 7. Paperwork chase queue after the board has
been in real use long enough to know what the chase workflow actually needs.

### Factoring payout reconciliation (Module 7)

The factoring company issues a payout statement daily for the loads it is
factoring. Invoicing marks those loads paid in Alvys; actual deposits are
confirmed against the bank account by the owner and a third-party bookkeeper.

SUPERDRIVE will need to replace that workflow — ingesting or recording the daily
payout statement, marking loads paid, and supporting deposit confirmation as a
separate step from the statement.

TRIGGER: Module 7, billing and invoicing.


### Late accessorial adjustments — the `-A1` path is documented and unbuilt (Module 7)

When an accessorial is agreed AFTER a load has already been settled, it cannot
be added through the charge-entry path: `assert_charge_entry_allowed` refuses
loads in `invoiced`, `factored`, `paid`, `settled` or `closed`, and its error
message points at the adjustment path (`-A1`) that does not exist.

What is missing:
- `accessorial_adjustments` table (or equivalent) to hold the late line.
- `invoices` / `supplemental_invoices` tables to bill the broker for the original
  load and any supplemental.
- A producer for the `adjustment` line-item kind that already appears in
  `settlementEngine.ts` as an enum member but has no corresponding writer.
- A workflow that picks up pending adjustments in the next settlement and,
  when the original invoice has already been sent, generates a supplemental
  invoice with a reference like `ST-1042-A1`, `ST-1042-A2`, etc.

This is a gap, not a bug: the `-A1` numbering scheme and the settlement behaviour
are written into `docs/tms-build-status.md`, but no tables or code implement
them.

TRIGGER: Module 7, billing and invoicing.

---

## KNOWN DEBT

### document_exceptions has readers and no writer

The paperwork predicate treats an approved or resolved exception as satisfying a
requirement — that path is what stops a receiver refusing to sign from parking a
load on a driver's chain permanently. But nothing in `src` or `supabase/functions`
creates a `document_exceptions` row. There is no filing UI and no edge function;
every touchpoint is a read or a staff resolve.

Consequence: today a load whose POD genuinely cannot be obtained has no way to
clear its paperwork, and under the per-load paperwork hold it would be withheld
from settlement indefinitely.

When the filing UI is built it MUST pass the slot's `photoLabel` on the loadout
path — the scoping fix of 2026-08-31 depends on it, and a NULL label satisfies
nothing labelled.

**TRIGGER: before real freight volume, or with the first load that cannot obtain
its paperwork.**

### Audit and revoke anon EXECUTE across definer functions — LARGELY DONE 2026-09-03, NARROWED
**TRIGGER (remaining scope): before any external launch or SaaS onboarding.**

**It was correct to have been open, and it was not tidiness: it contained a LIVE
UNAUTHENTICATED DATA DISCLOSURE.** The audit ran on 2026-09-03 and found
`public.get_pei_requests_needing_action()` — SECURITY DEFINER, no guard,
anon-executable since 2026-05-13, returning applicant names and prior-employer
contact emails to any holder of the anon key, and with NO CALLER anywhere in the
codebase. Also found `public.email_queue_dispatch()` anon-executable, able to
unschedule the mail-delivery cron. Both were fixed the same day. The full
incident record is in `docs/tms-build-status.md`.

Also done: thirteen no-anon-caller helpers revoked from `PUBLIC` and `anon`;
`is_staff(uuid)` deliberately RETAINED because `/apply` needs it through a
non-definer trigger; live anon-executable definers **48 → 33**; and the anon
inventory guard now requires a written `ROUTE`/`GUARD` justification per entry.

**What remains open, and only this:**

1. The 33 remaining anon-executable definers are INVENTORY — each classified by
   hand on 2026-09-03, each now carrying a written justification. Two carry known
   sensitivities rather than defects: `check_application_email_taken` (email
   enumeration) and `get_application_by_draft_token` (returns all application
   columns — tracked separately as KNOWN DEBT 4.1).
2. The ~161 NON-definer functions carrying `anon=X` were not touched by this
   audit and have never been classified.
3. `KNOWN_AUTHENTICATED_EXECUTABLE` (110 entries) was deliberately not given
   per-entry justifications; a half-populated set would be worse than none.
4. No guard watches functions reached through non-definer triggers running as the
   calling role — recorded as KNOWN DEBT in `docs/tms-build-status.md`.

**This still cannot be done in bulk.** The token-gated public paths —
`resolve_share_token`, `get_application_by_draft_token`,
`get_inspection_doc_by_token`, `resolve_short_link`, the PEI response path and
the application draft-save path — legitimately need anon. Revoking one breaks
`/inspect/:token` or the public application flow **with no obvious symptom**: the
failure surfaces as a blank page to someone outside the company. Classify each
function individually — body read, callers traced, anon-reachability decided.
Do not run a loop.


### Test tooling can change without a commit
**TRIGGER: if a baseline moves and no code change explains it.**

vitest is pinned as `^3.2.4`, so a `node_modules` reinstall pulled 3.2.7 unasked
mid-session, and every recorded baseline is now measured against a version that
arrived by accident. Nothing broke. But the baselines in `gate.ts`, `README.md`
and `tms-build-status.md` are the project's primary evidence that nothing
silently stopped running, and a caret range lets the tool producing that
evidence shift without any commit recording it.

The fix is either an exact vitest pin in `package.json` or a committed lockfile
that the installer respects.

(The canvas-stub half of this entry is resolved: the stub is now re-linked from
vitest `globalSetup` on every run, so no install hook is involved. See
`tools/canvas-stub/globalSetup.mjs`.)

### Reader fixtures for loadPaperwork are AUTHORED, not writer-derived
Standing rule: a persisted shape is tested at both writing and reading
boundaries, with reader fixtures derived from writer output. The Pass 2
loadPaperwork reader fixtures break this knowingly. `document_exceptions` is not
modelled in pgFake at all, and `load_documents` is an empty table there with no
write path, so there is no writer to drive. Stated in the test file header rather
than passed off as derived.

TRIGGER: when `load_documents` gains a write path in pgFake — most likely when
the driver app document upload flow is built (Module 11). Re-derive then.

### Roof-check photo matches on a free-text label
The loadout roof-check requirement matches `photo_label` against the literal
string 'Rear Doors Open'. `photo_label` is free text with suggestions, so a driver
who types anything else does not satisfy it. A coupling assertion keeps the
suggestion list and the predicate in sync, but does not fix the underlying
looseness.

The durable fix is a FIXED CAPTURE SLOT in the driver app, not a looser matcher.
Do not add fuzzy or partial matching to compensate.

TRIGGER: Module 11, driver app guided photo capture.

### Storage objects leak whenever a row is deleted by any route but the app

Cleanup lives in TypeScript call sites, so cascades, direct SQL and edge
functions all delete the row and leave the file. Found after four orphans
accumulated in five days from ordinary test reverts.

Worst cases, in order:

- ica-signatures: NO delete path anywhere. DeactivationWizardContent and
  delete-user-account both delete ica_contracts rows outright; signature objects
  are never removed. Permanent leak of signed contract signatures.

- operators cascade: ~40 child tables carrying file paths, none cleaning storage.
  Deleting one operator row orphans that driver's entire document history.
  delete-user-account can reach this.

- loads → load_documents CASCADE: live and silent; no app path deletes a loads
  row yet.

- message-attachments: messages soft-delete and blank the attachment fields, so
  the object survives with nothing referencing it. delete-user-account
  hard-deletes with no storage call.

- Several UI delete paths use .catch(() => {}) on the storage removal, so a
  storage failure silently orphans.

rods-logs is the only bucket with a safety net (sweep-rods-orphans).

Two durable fixes: a delete-time trigger enqueuing paths for a sweeper, or a
periodic per-bucket reachability sweep modelled on sweep-rods-orphans. Per-call-
site cleanup is what failed.

TRIGGER: before real document volume, or before any path that deletes an operator
or a load row ships.

---

## KILLED — do not re-litigate

### Empty miles / deadhead as a Dispatch Board column
Alvys exposes 50+ optional columns via checkboxes. That is a symptom of a product
that does not know what its user needs, so it exposes everything and calls it
flexibility. SUPERDRIVE is opinionated by design.

KILLED as a column. The underlying MILEAGE CAPABILITY remains parked above,
because RPM in Module 9 is a separate and stronger argument.

### Moving `assigned_dispatcher` from `active_dispatch` to `operators`
Considered and rejected 2026-08-26. The column is fully populated (all 34 active
drivers, six dispatchers) and has a working app writer — the inline Edit control
on Driver Status writes it. Exclusion from dispatch is a FLAG on `operators`
(`excluded_from_dispatch`), not a row delete, which was the load-bearing part of
the risk argument. Migrating 34 live assignments and rewiring four readers to fix
a semantic mismatch that has not bitten is not a good trade.

### Formal offer-and-accept step for load assignment
The operating model states there is no formal offer-and-accept step and one
should not be built. `loads.driver_accepted_at`, `driver_declined_at` and
`driver_decline_reason` exist from Module 2 and contradict this. Decision: the
columns STAY, no migration removes them, and no surface treats them as a gate.

---

## SAAS-ONLY — another carrier would want these; SUPERTRANSPORT does not

Items here are NOT built for SUPERTRANSPORT and are recorded so that a prospect
asking for them gets a considered answer rather than an improvised one.

- Empty miles / deadhead per load — requires the mileage engine above
- Broad column customization of list views
- Integration specs for incumbent TMS platforms (McLeod, TMW, Prophet), to avoid
  all-in-one perception

Standing position: a carrier evaluating SUPERDRIVE against Alvys on feature COUNT
will always find Alvys wins. The pitch is the shared data flow — applicant becomes
DQ file becomes dispatched driver with no re-entry. That is the moat, not parity.

---

## HOW TO USE THIS FILE

When something is raised that is not being built now:
  1. Add it here with a TRIGGER
  2. If it is decided against, move it to KILLED with the reasoning
  3. When a trigger fires, promote it into a build pass and remove it from here

Do not let items accumulate without triggers.

### ~435 edge-function queries destructure `data` and discard `error`

`rg` over `supabase/functions/**/*.ts` found **435** `const { data ... }`
destructures. Of those, about **15** touch money or a guard vocabulary (settlement,
charge, deduction, invoice, deposit, advance, policy, rate, hold, load, fuel).
The older "~246" count was an undercount or an older snapshot.

The concentration was never in the edge functions. It was in
`src/lib/settlementRun.ts`'s `gatherSettlementRun`, where a single function
discarded the error on every one of its ~12 reads. That concentration is now
fixed; the remaining edge-function sites are a thin scatter.

Not fixed wholesale: 435 mechanical edits across live functions is a large blast
radius for a change that cannot be verified from tests, and most of the sites are
genuinely tolerant of an empty result.

TRIGGER: bind and check `error` in any edge-function query **at the moment that
function is next edited for any other reason**, and in every new one. When a
function's queries are all checked, note it here. Revisit wholesale only if a
second silent-failure defect of this shape is found in production.

### Broker-level default detention terms
Terms are recorded per load, from the document that stated them. Several brokers
print the same terms on every confirmation, so a dispatcher retypes them each
time, and a mistyped free-time window is invisible until it is quoted back in a
dispute.

Not built: a broker-level default has to be presented as a SUGGESTION that the
document can override, never as a term, and the moment it is stored on the load
its provenance ("this came from the broker record, not this confirmation") has to
travel with it. That is a provenance design, not a defaults form, and there is no
evidence yet on how often the same broker's terms actually vary.

TRIGGER: when a dispatcher reports retyping identical terms for the same broker,
or when parser extraction (Module 5 Pass 3) lands and the parsed-vs-default
disagreement becomes something the system can measure.
