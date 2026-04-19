

## Settlement Forecast — Operator Self-Service Planning Tool

A new operator-portal tab where drivers enter loads, fuel, advances, and repair payback to see what their settlement Tuesday will look like — 3 weeks out, with full history.

### Settlement math (from your PDFs)

- **Work Week:** Wednesday 12:00 AM → Tuesday 11:59 PM (US Central)
- **Payday:** Tuesday, exactly **2 Tuesdays after** the work week ends
- Example: Work week Apr 1–7 (Wed–Tue) → Payday Apr 21
- A load delivered on Apr 5 is auto-bucketed into the Apr 21 settlement
- A fuel purchase on Apr 5 is deducted on the same Apr 21 settlement

The tool computes the work-week boundaries and matching payday from any date the operator enters — they never pick a "settlement week" manually.

### Per-settlement formula

```
Gross Pay      = Σ load rates in week × operator pay % (default 72%)
Fuel           = Σ fuel purchases in week
Cash Advances  = Σ advances in week
Repair Payback = scheduled installment for that payday (if any)
Other          = scheduled one-off deductions hitting that payday
─────────────────────────────────────────────
Net Forecast   = Gross Pay − Fuel − Advances − Repair − Other
```

### UI placement & layout

New top-level tab in `OperatorPortal.tsx`: **"Settlement Forecast"** (icon: `Calculator` or `TrendingUp`), positioned near "My Truck" / "Pay Setup".

**Page layout — 3 settlement cards stacked vertically (mobile-first):**

```text
┌─────────────────────────────────────────────┐
│ ⚠ Forecast Only — does not include tolls,    │
│   IFTA, registrations, or unlisted fees      │
└─────────────────────────────────────────────┘

┌─ Payday Tue Apr 21 ────────── Net: $2,680 ─┐
│  Work Week: Apr 1 – Apr 7                  │
│  ─────────────────────────────────────────│
│  Loads (3)              [+ Add load]       │
│   • Apr 3 · Dallas, TX · $2,400 → $1,728  │
│   • Apr 5 · Memphis, TN · $1,800 → $1,296 │
│   • Apr 6 · Atlanta, GA · $2,100 → $1,512 │
│  Fuel (2)               [+ Add fuel]       │
│   • Apr 4 · $620                           │
│   • Apr 6 · $580                           │
│  Cash Advance: $0       [+ Add]            │
│  Repair Payback: $250 (2 of 3) ⓘ          │
│  Other: —               [+ Add]            │
└────────────────────────────────────────────┘

┌─ Payday Tue Apr 28 ─ ...                    │
┌─ Payday Tue May 5  ─ ...                    │

[ Manage Repair & Recurring Deductions ]
[ View Past Settlements ▼ ]
```

Each card: collapsible sections, inline `+ Add` buttons that open a small modal (Date, City/State, Rate for loads; Date + Amount for fuel/advance). The 72% conversion happens live as they type the rate ("$2,000 → you'll see $1,440").

**Repair & recurring deductions modal:** simple list manager — "$1,000 over 3 weeks starting Apr 21" auto-generates 3 installments of $333.34/$333.33/$333.33 across the matching paydays. Same form supports one-off "Other" items (registration, etc.) tied to a single payday.

**History view:** below the 3 active cards, a collapsible "Past Settlements" list shows all previous paydays the operator has data for, read-only.

### Data model (3 new tables)

```sql
-- 1. Loads
forecast_loads (
  id uuid pk,
  operator_id uuid,           -- RLS: operator owns own rows
  delivery_date date,
  delivery_city text,
  delivery_state text,
  load_rate numeric(10,2),    -- gross rate; 72% applied at display time
  notes text,                 -- optional
  created_at, updated_at
)

-- 2. Fuel & cash advances (same shape, type discriminator)
forecast_expenses (
  id uuid pk,
  operator_id uuid,
  expense_date date,
  expense_type text,          -- 'fuel' | 'advance'
  amount numeric(10,2),
  notes text,
  created_at, updated_at
)

-- 3. Repair installments + one-off "other" deductions
forecast_deductions (
  id uuid pk,
  operator_id uuid,
  label text,                 -- "Truck repair – brake job", "MO registration"
  payday_date date,           -- the Tuesday this hits
  amount numeric(10,2),
  group_id uuid,              -- groups installments of one repair together
  installment_number int,     -- "2 of 3"
  installment_total int,
  created_at, updated_at
)
```

**Pay percentage:** add `pay_percentage int default 72` to the existing `operators` table. Operator sees it read-only in the tool ("Your pay rate: 72%"); staff can edit it in the Operator Detail Panel later (out of scope for v1).

**RLS:** strict per-operator on all three tables (operator can CRUD own rows; staff can SELECT for support).

### Date math (US Central, follows existing project convention)

- All dates parsed as `YYYY-MM-DD` + `T12:00:00` (per your timezone memory)
- Helper `getWorkWeekFor(date)` → returns `{ weekStart: Wed, weekEnd: Tue, payday: Tue+14d }`
- Helper `getNext3Paydays(today)` → returns the 3 upcoming Tuesdays the operator can plan against
- Loads/fuel auto-route to the correct settlement card by their date — operator never picks a week

### Disclaimer (always visible at top)

> **Forecast Only.** This tool estimates your settlement based on the loads, fuel, and deductions you enter. It does not include tolls, IFTA, registration renewals, or other fees that may apply. Actual settlement may differ.

### Files to create / change

| File | Change |
|---|---|
| `supabase/migrations/...` | 3 new tables + RLS + add `pay_percentage` to `operators` |
| `src/lib/settlementMath.ts` | NEW — work-week + payday math, 72% calc, installment splitter |
| `src/components/operator/SettlementForecast/index.tsx` | NEW — main page, 3-card layout |
| `src/components/operator/SettlementForecast/SettlementCard.tsx` | NEW — single payday card |
| `src/components/operator/SettlementForecast/AddLoadModal.tsx` | NEW |
| `src/components/operator/SettlementForecast/AddExpenseModal.tsx` | NEW (handles fuel + advance) |
| `src/components/operator/SettlementForecast/DeductionsManager.tsx` | NEW — modal for repair installments + one-off |
| `src/components/operator/SettlementForecast/PastSettlements.tsx` | NEW — history accordion |
| `src/pages/operator/OperatorPortal.tsx` | Add `forecast` view + sidebar link |

### Out of scope (v1)

- Staff-side editing of operator forecasts
- Importing actual settlement data to compare forecast vs actual
- Dispatch/load auto-population (operator types loads manually for now)
- Per-operator pay % override UI for staff (column added, but staff editing UI is later)

### After deploying

1. Operator opens portal → new **Settlement Forecast** tab
2. Sees 3 payday cards (next 3 Tuesdays) with disclaimer banner at top
3. Taps **+ Add load** → enters Apr 5, "Memphis, TN", $1,800 → instantly slots into the correct payday card and shows $1,296 net contribution
4. Adds fuel, schedules a 3-installment repair payback once → tool auto-applies it across the right paydays
5. Each Tuesday, the oldest card rolls off into "Past Settlements" history; a new future card appears

