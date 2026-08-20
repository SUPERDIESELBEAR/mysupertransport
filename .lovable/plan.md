# Rate Confirmation Follow-Ups — Unattached Charges, PDF Viewer, Broker State, Normalization

## Issue 3 — diagnosis first (source document spinner never ends)

Confirmed by reading `RateConfirmationParser.tsx`. This is not a pdfjs failure, not a bytes problem — it is an effect-dependency bug in our own code.

The render effect lists `pdfRendering` (and `pdfPages`) in its dependency array and also sets `pdfRendering` inside itself:

1. First run: `cancelled = false`, `setPdfRendering(true)`, starts `pdfFileToImages(file)`.
2. That state change re-runs the effect. React first runs the previous cleanup, which sets `cancelled = true` for the in-flight render.
3. The second run hits the `if (pdfPages || pdfRendering) return;` guard and does nothing.
4. When the real render resolves, every callback is gated on `cancelled` — which is now `true`. So `setPdfPages` never fires and `setPdfRendering(false)` never fires.

Result: `pdfRendering` stays `true` forever and the panel shows "Rendering the document…" permanently. pdfjs actually completed; we threw the result away. The same would happen to any PDF, on any browser — it is deterministic, not file-specific.

Fix: drive the effect only from `[file, showSource]`, track the in-flight file with a ref so a re-open does not re-render an already-rendered file, and remove the self-referential state from the dependency list. Keep the error branch and the "open in new tab" fallback.

## Issues 1 and 2 — unattached rate lines

### Behavior
- The section becomes "Charges found on the document". Copy reflects reality: when there is no eligible middle stop, it says so instead of asking for a decision that cannot be made.
- Each line offers: assign to a stop (only when eligible middle stops exist), **Add to load total** (new), and Leave it out.
- "Add to load total" moves the line into a small "Additional charges" list shown with the rate fields, each removable, and immediately included in Total Load Value. For the AAA document, the $50 Extra Stop lands there and the total reads $1,050.

### Persistence — new `load_charges` child table

```sql
create table public.load_charges (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  load_stop_id uuid references public.load_stops(id) on delete set null,
  charge_type text not null,          -- 'stopoff', 'detention', 'other' … enum later
  description text,                   -- broker's own label, e.g. "Extra Stop"
  amount numeric not null default 0,
  source text not null default 'manual',  -- 'parsed_rate_confirmation' | 'manual'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create index load_charges_load_id_idx on public.load_charges(load_id);
```

- Grants: `select, insert, update, delete` to `authenticated`; `all` to `service_role`; **no anon grant**.
- RLS mirrors `load_documents`: management / owner / dispatcher full read-write; onboarding staff read only; operators read only for loads assigned to them.
- `created_by` / `updated_by` stamped by a `before insert/update` trigger using `current_profile_id()`, same as `facilities` and `load_documents`.
- Kept deliberately minimal — no approval state, no adjustment refs, no accessorial enum. Those arrive with the accessorials module.

On save:
- `loads.linehaul_rate` — unchanged base ($1,000). `loads.fsc_amount` — unchanged.
- One `load_charges` row per additional charge (`charge_type 'stopoff'` for an Extra Stop, `source 'parsed_rate_confirmation'`, `load_stop_id` null when load-level).
- `loads.total_load_value` — includes those charges ($1,050).
- `loads.special_instructions` — still gains the human-readable itemized block, regenerated rather than duplicated. The table is authoritative; the text is a convenience.

Since `create_load_with_stops` inserts the load and stops in one transaction, it gains a third payload argument for charges so the stop rows exist before a `load_stop_id` is referenced. Everything stays atomic.

### Interaction with `load_stops.stopoff_charge_amount` — and the double-counting risk

Your preference does create a real double-counting risk, and it is worth naming precisely: a stop-assigned charge would exist both as `load_stops.stopoff_charge_amount` and as a `load_charges` row with `load_stop_id` set. Any future report that does `sum(stopoff_charge_amount) + sum(load_charges.amount)` overstates the load.

Proposal that keeps your "one place to read all charges" goal without the risk:

- Write both, as you asked — the mirror row is created for every stop-assigned charge.
- **`load_charges` is authoritative.** `load_stops.stopoff_charge_amount` is a denormalized display mirror of the row whose `load_stop_id` points at that stop, and nothing else may treat it as an independent amount.
- The total is computed from exactly one source: `sum(load_charges.amount)` for the load, plus base and FSC. `stopoff_charge_amount` is never added to a total again — `calcTotalLoadValue` takes charges, not stop-off amounts, so the create form derives its live total from the same list that gets written.
- In the form, entering a stop-off amount on a stop card creates or updates that stop's charge entry; clearing it removes the entry. There is one number, shown in two places.
- A unit test asserts the total for a load with one stop-assigned charge and one load-level charge equals base + FSC + both amounts once, guarding the regression directly.


## Issue 4 — broker field shows the extracted name

When the parser finds a broker name that is not linked to a directory record, `BrokerSelect` shows that name in the trigger instead of the placeholder, styled as provisional (italic/muted with a "Not in directory" badge), plus a one-line hint under the field: "Found on the rate confirmation — create it or pick a match." Selecting or creating a broker clears the provisional state. Nothing is written to `broker_id` until a real record exists, and save validation is unchanged.

## Issue 5 — normalize parsed values

Parsed values run through `src/lib/textNormalize.ts` before they reach the form, inside `applyParsedToForm`:
- Facility name: underscores to spaces, whitespace collapse, then title case — `GADSDEN_WAREHOUSING_INC` becomes `Gadsden Warehousing Inc`.
- City, address line 1/2, contact name: whitespace collapse + title case.
- ZIP: `normalizeZip`. Phone: `normalizePhone`, displayed with `formatPhone`.
- State left as the two-letter code.
- The existing acronym exception in `toTitleCase` is untouched, so `US`, `NE`, `LLC` survive. A screaming-caps multi-word name with underscores is treated as a formatting artifact and normalized, which is exactly the distinction you drew.

## Technical notes

- `RateConfirmationParser.tsx`: effect dependency fix; assign dropdown gains the "add to load total" option and conditional stop options; section heading and helper copy; provisional broker name handed to the form.
- `src/lib/rateConfirmation.ts`: normalization on stop and broker fields in `applyParsedToForm`; return unattached lines unchanged.
- `src/pages/dispatch/loadFormSchema.ts`: new `additional_charges` array field (description + amount) on the form only.
- `src/lib/loadRateMath.ts`: `calcTotalLoadValue` sums `additionalCharges` for non-loadout loads; new unit tests alongside the existing stop-off tests.
- `src/pages/dispatch/CreateLoadPage.tsx`: pass additional charges into the total, render the removable list near the rate fields, append the itemized block to `special_instructions` on submit.
- `BrokerSelect.tsx`: optional `provisionalName` prop and hint.
- Verification: re-parse the real AAA Freight PDF — source panel renders inline, $50 assignable to the load total, Total Load Value $1,050, broker field shows "AAA Freight Global Inc. — not in directory", stops read Macon / Attalla / Gadsden Warehousing Inc in title case.
