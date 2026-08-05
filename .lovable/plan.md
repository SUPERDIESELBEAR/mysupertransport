# Vehicle Hub — State Permit Registration Indicator (NM / NY / OR / KY)

## Recommendations (answers to your four questions)

### 1. UI pattern — compact row of four state chips
Recommended: a single **row of four fixed state chips** (`NM  NY  OR  KY`) on its own thin bordered row of the vehicle card, directly under the Plate/VIN specs block.

- All four states always appear in the same order on every card, so the eye lands in the same place every time. A dropdown or collapsible ribbon hides the answer behind a click, which defeats "scannable at a glance."
- Registered = solid gold chip with a small check. Not registered = muted outline chip, low contrast. A truck with no permits reads as quiet grey; a truck with permits pops.
- Height cost is one ~22px row. No layout reflow, no per-card variability.
- Chips are **not** toggled inline on the card. Clicking a card currently opens the driver profile, and inline toggles on a click-through card cause accidental edits. Editing happens in the existing **Edit** modal (Quick Truck Edit), which gains a "State Permits" section with four switches. Card chips get a tooltip showing status and expiration.
- List view gets the same information as a compact `NM · OR` text cell in a new "State Permits" column, so both view modes stay in sync.

### 2. Independent toggles, with optional per-state document tracking
Each state toggles **independently** — no state forces another on, and none are prerequisites for anything.

When a state is switched on:
- An optional **permit/credential number** field and an optional **expiration date** appear for that state.
- An optional **document upload** slot appears (NM Weight Distance permit, NY HUT credential, OR Weight-Mile / temp pass, KY KYU). Uploaded files land in the existing driver document store used by the roadside binder, so the permit travels with the truck's inspection binder — where an officer would ask for it.
- Nothing is required. Staff can flip a state on and fill details in later; the toggle never blocks a save.
- If an expiration date is entered, the chip turns amber within 30 days of expiry and red once expired. With no date the chip stays plain gold — tracked but not date-monitored.

### 3. Visibility elsewhere
Recommended for this build: **Vehicle Hub only** (cards + list), plus the permit documents naturally appearing in the driver's inspection binder because that is where the file is stored.

Deliberately excluded for now:
- **Compliance section** — that view is driven by go-live-critical items (CDL, Med Cert, IRP, DOT inspection). These permits are optional and route-dependent, so adding them would create false "missing item" noise — the same problem the IFTA Decal item caused.
- **Applicant Pipeline** — permits are a post-go-live operational matter, not an onboarding gate.

If you want a compliance surface later, the right shape is a separate opt-in "Permits" filter that flags only *expired* permits on trucks where the state is switched on — never a "missing" flag.

### 4. Defaults — off
All four default to **off** (not registered). Off means "not registered / not tracked" and is never treated as an open item, a missing document, or a completion blocker anywhere in the app. Existing trucks stay all-off until staff enables a state.

---

## What gets built

1. **Data**: a per-truck record for the four states — registered yes/no, optional credential number, optional expiration date, optional linked document.
2. **Vehicle Hub cards**: the four-chip state permit row under the specs block, with tooltips for number/expiry and amber/red coloring on approaching or past expiration.
3. **Vehicle Hub list view**: a compact "State Permits" column showing enabled state abbreviations.
4. **Edit modal**: a "State Permits" section with four independent switches; enabling one reveals its optional number, expiration date, and upload slot.
5. **Filter**: an optional Vehicle Hub filter to show only trucks registered in a chosen state, useful for dispatch routing questions.

## Technical notes

- New table `truck_state_permits` keyed to the operator, one row per truck per state, with `state_code`, `registered`, `permit_number`, `expires_at`, `document_id`. Access mirrors existing fleet tables: management, owner, and dispatch staff read and write; drivers read their own truck's rows.
- `FleetRoster.tsx` pulls permits inside its existing `buildRows` fetch (no extra round-trip per card), plus a shared `StatePermitChips` component used by both cards and list view.
- `QuickTruckEditModal.tsx` gains the editing section and writes permit rows alongside the existing truck spec save.
- Uploads reuse the existing driver document / inspection binder path so permits appear in the roadside binder automatically.
- Nothing is added to `pipeline_config`, onboarding completion math, progress percentages, or open-item counts.