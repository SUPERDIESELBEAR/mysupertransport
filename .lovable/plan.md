
## Three Stage 1 improvements

### Answer to question 3 — Date fields
There are currently **no** date fields for any Stage 1 items in the database. The `onboarding_status` table tracks only status values (not_started / requested / received / etc.) — no dates are stored for when things were requested or received. We can add them, but that is a separate task. For now, this plan covers only the three items you asked about.

---

### Change 1 — PE Screening blocks Stage 1 completion

**Two places to fix:**

**A. `OperatorDetailPanel.tsx` — the hardcoded stage array (3 spots)**
- Line 1900: `s1Complete` — change from `mvr_ch_approval === 'approved'` to also require `pe_screening_result === 'clear'`
- Line 1773: same fix in the sticky-bar stage array
- Line 1025: same fix in the mini-bar stage array
- Add "PE Screening Clear" as a 4th item in all three stage item lists

**B. `pipeline_config` database record for the `bg` stage**
- Insert a new item into the `items` JSON array: `{ key: "pe_clear", label: "PE Screening Clear", field: "pe_screening_result", complete_value: "clear" }`
- This keeps the Pipeline Dashboard's BG node in sync with the detail panel

---

### Change 2 — Background Check notes field

**A. Database migration**
Add a nullable text column to `onboarding_status`:
```sql
ALTER TABLE public.onboarding_status ADD COLUMN IF NOT EXISTS bg_check_notes TEXT;
```

**B. `OperatorDetailPanel.tsx` TypeScript type**
Add `bg_check_notes: string | null` to the `OnboardingStatus` type.

**C. Stage 1 UI**
Add a `Textarea` below the existing 5 dropdowns in Stage 1:
- Label: "Background Check Notes"
- Placeholder: "e.g. vendor name, order date, any issues…"
- Bound to `status.bg_check_notes`
- Included in the save payload (already handled by the generic `status` object spread in `handleSave`)

**D. Fetch query**
The `fetchOperatorDetail` query uses `onboarding_status (*)` which will automatically include the new column — no query change needed.

---

### Files changed

| File | Change |
|---|---|
| DB migration | Add `bg_check_notes` column to `onboarding_status` |
| DB data update | Add PE screening item to `pipeline_config` BG stage items |
| `OperatorDetailPanel.tsx` | Fix `s1Complete` in 3 places, add PE item to 3 stage arrays, add notes textarea |

No other files need changes. The save flow, RLS, and notification logic are unaffected.
