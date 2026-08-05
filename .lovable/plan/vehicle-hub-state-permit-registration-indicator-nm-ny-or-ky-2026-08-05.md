# Vehicle Hub — State Permit Registration Indicator (NM / NY / OR / KY)

## Recommendations (answers to your four questions)

### 1. UI pattern — compact row of earned state chips
Recommended: a single **thin row of state chips** on the vehicle card, directly under the Plate/VIN specs block, showing **only the states that are toggled on** for that truck.

- States render in **alphabetical order: KY, NM, NY, OR**.
- A truck can have any combination — one, several, or all four.
- Only enabled states appear. Nothing is rendered for states that are off, and when a truck has no state permits at all the entire row is omitted, so those cards look exactly as they do today.
- Enabled chips are solid gold with the state abbreviation, so permitted trucks pop against the plain ones at a glance.
- A dropdown or collapsible ribbon hides the answer behind a click, which defeats "scannable at a glance."
- Height cost is one ~22px row, and only on trucks that have permits. No layout reflow.
- Chips are **not** toggled inline on the card. Clicking a card currently opens the driver profile, and inline toggles on a click-through card cause accidental edits. Editing happens in the existing **Edit** modal (Quick Truck Edit), which gains a "State Permits" section with the four switches listed alphabetically. Card chips get a tooltip showing the permit number and expiration.
- List view follows the same rule: a compact "State Permits" cell listing only the enabled states alphabetically (`KY · OR`), and a dash when none are on.

### 2. Independent toggles, with optional per-state document tracking
Each state toggles **independently** — a truck can be permitted in any number of them, no state forces another on, and none are prerequisites for anything.

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
2. **Vehicle Hub cards**: a state permit row under the specs block showing only enabled states in alphabetical order (KY, NM, NY, OR), with tooltips for number/expiry and amber/red coloring on approaching or past expiration. The row is hidden entirely when no states are enabled.
3. **Vehicle Hub list view**: a "State Permits" column listing only the enabled states alphabetically.
4. **Edit modal**: a "State Permits" section with four independent switches in alphabetical order; enabling one reveals its optional number, expiration date, and upload slot.
5. **Filter**: an optional Vehicle Hub filter to show only trucks registered in a chosen state, useful for dispatch routing questions.

## Technical notes

- New table `truck_state_permits` keyed to the operator, one row per truck per state, with `state_code`, `registered`, `permit_number`, `expires_at`, `document_id`. Access mirrors existing fleet tables: management, owner, and dispatch staff read and write; drivers read their own truck's rows.
- `FleetRoster.tsx` pulls permits inside its existing `buildRows` fetch (no extra round-trip per card), plus a shared `StatePermitChips` component used by both cards and list view that filters to `registered = true` and sorts by state code.
- `QuickTruckEditModal.tsx` gains the editing section and writes permit rows alongside the existing truck spec save.
- Uploads reuse the existing driver document / inspection binder path so permits appear in the roadside binder automatically.
- Nothing is added to `pipeline_config`, onboarding completion math, progress percentages, or open-item counts.