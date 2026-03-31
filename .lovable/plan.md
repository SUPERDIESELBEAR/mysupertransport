

## Fix: Date of Birth Off by One Day (Timezone Issue)

### Root Cause

When JavaScript parses a date-only string like `"1990-05-15"` via `new Date("1990-05-15")`, it interprets it as **UTC midnight**. In US Central Time (UTC-5 or UTC-6), that becomes **the previous evening** — so `toLocaleDateString()` displays **May 14** instead of **May 15**.

### Where It's Already Fixed

`OperatorDetailPanel.tsx` already appends `'T12:00:00'` to the date string before parsing, which anchors it to noon and prevents the day from shifting. This is the correct pattern.

### Files That Need the Fix

All 4 files parse `app.dob` with bare `new Date(app.dob)`:

| File | Current Code | Fix |
|------|-------------|-----|
| `ApplicationReviewDrawer.tsx` (line 626) | `new Date(app.dob).toLocaleDateString()` | `new Date(app.dob + 'T12:00:00').toLocaleDateString()` |
| `CompanyTestingPolicyCertDoc.tsx` (line 14) | `new Date(app.dob).toLocaleDateString(...)` | `new Date(app.dob + 'T12:00:00').toLocaleDateString(...)` |
| `DOTDrugAlcoholQuestionsDoc.tsx` (line 75) | `new Date(app.dob).toLocaleDateString(...)` | `new Date(app.dob + 'T12:00:00').toLocaleDateString(...)` |
| `FCRAAuthorizationDoc.tsx` (line 14) | `new Date(app.dob).toLocaleDateString(...)` | `new Date(app.dob + 'T12:00:00').toLocaleDateString(...)` |

### Same Issue with `signed_date`

These same document components also parse `app.signed_date` the same way (`new Date(app.signed_date)`), which could have the identical off-by-one problem. Those will be fixed with the same `+ 'T12:00:00'` pattern.

### No other changes needed
The input field itself stores the date correctly as a `YYYY-MM-DD` string. The bug is only in how it's displayed.

