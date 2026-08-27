# SUPERDRIVE — Wish List and Parked Decisions

Companion to docs/tms-build-status.md. That file records what is TRUE and what is
DECIDED. This file records what is PARKED.

Every item carries a TRIGGER: what has to become true before it is worth picking
up. An item without a trigger becomes a graveyard entry. Items leave this list by
being promoted into a build pass or by being explicitly killed — and a killed item
stays here, marked killed, so it is not re-litigated.

Last updated: 2026-08-26

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

---

## OPEN QUESTIONS — answer before the named module

### Detention terms on the rate confirmation (Module 5, later pass)

Industry standard free time is 2 hours; some brokers write 3. Rate cons also
vary on the CLOCK START TRIGGER — scheduled appointment, actual arrival, or gate
check-in are three different moments and can differ by 30–90 minutes. Many cons
carry daily caps ($200–$400) and a notification requirement. When a driver calls
at hour three, the dispatcher should see this load's terms without opening a
PDF. Candidate for parser extraction into structured fields.

TRIGGER: before the detention claim record is built.

### Dispatch company settlement (Module 6)
The dispatch team is ONE 1099 vendor — a separate company, owner plus team, all
carrying @mysupertransport.com addresses and representing themselves as part of
the SUPERTRANSPORT team, dispatching exclusively for SUPERTRANSPORT.

SETTLED:
  - Payee is the COMPANY, not the individual dispatcher. Attribution by dispatcher
    is for visibility; exactly one settlement and one 1099.
  - 5% of each load.
  - MONTHLY calendar period. August 1–31 pays on or around September 10 or sooner.
  - No R&M deposit, no minimum net pay threshold, no two-week holdback. Those are
    driver-side rules and must not be applied here.
  - Two deduction kinds:
      * Recurring, configured once: phone service, share of factoring costs
      * Per-settlement, hand-entered: transaction fees, one-off items such as a
        claim or a load not handled properly
  - One-off deductions must carry a LOAD REFERENCE. "Claim — $400" is unarguable
    six months later; tied to a specific load it defends itself.
  - Module 6 therefore serves TWO payee types. The settlement tables must not be
    designed around drivers alone and retrofitted later.

OPEN:
  - What is the 5% a percentage of? Linehaul only, linehaul plus fuel surcharge,
    or gross including accessorials? Detention pays 100% to the driver — does the
    dispatch company earn on it?
  - Which month does a load belong to: booked, delivered, or invoiced? A load
    booked Aug 30 and delivered Sep 2 must land in exactly one month, and the rule
    must be the same every month.
  - Is the factoring cost share a flat monthly amount or a percentage of actual
    factoring cost that month?

TRIGGER: before Module 6 settlement tables are designed.

### Driver revenue report period basis (Module 6)
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

### Reimbursement pay class
Fully designed, deliberately unbuilt pending a formal spec. Design confirmed:
driver-funded expenses reimburse at actual cost; company-funded expenses
(Comdata/MultiService) are company revenue; broker overage is company margin;
proof document required; unsettled lines hold while the rest of settlement
proceeds.

TRIGGER: formal spec written, before Module 6.

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

---

## KNOWN DEBT

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

### 246 edge-function queries destructure `data` and discard `error`
Counted across 78 files in `supabase/functions`: `const { data } = await
supabase.from(...)...` with no `error` binding. A rejected query is then
indistinguishable from an empty result, and the caller proceeds on `null`. This
is exactly how the `operators.email` defect in `send-notification` stayed
invisible in production — the audit row simply recorded a null address.

Not fixed wholesale: 246 mechanical edits across live functions is a large blast
radius for a change that cannot be verified from tests, and most of the sites are
genuinely tolerant of an empty result.

TRIGGER: bind and check `error` in any edge-function query **at the moment that
function is next edited for any other reason**, and in every new one. When a
function's queries are all checked, note it here. Revisit wholesale only if a
second silent-failure defect of this shape is found in production.
