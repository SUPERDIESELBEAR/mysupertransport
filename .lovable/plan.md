

## Fix: Expiration Dates Showing One Day Earlier Than Entered

### Root cause

This is a timezone bug. When you enter `2026-10-10` in the date picker, it's saved correctly as `2026-10-10` in the database. But when **displaying** or **calculating** with that date, the code does `new Date('2026-10-10')` — which JavaScript interprets as **midnight UTC**. In US Central time, that's **October 9th at 7 PM**, so `toLocaleDateString()` shows October 9th instead of October 10th.

This affects every place dates are displayed or compared in the inspection binder (and potentially elsewhere).

### Fix

Add `T00:00:00` when parsing date-only strings so JavaScript treats them as **local midnight** instead of UTC midnight. Alternatively, split the date string and construct the display directly without going through `Date` at all.

The safest, most consistent approach: create a small utility function that parses `YYYY-MM-DD` strings correctly, then use it everywhere.

**1. Add a utility to `src/components/inspection/InspectionBinderTypes.ts`**

```ts
/** Parse a YYYY-MM-DD date string as local midnight (not UTC) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
```

**2. Update all `new Date(expiresAt)` calls in inspection files**

Replace every `new Date(expiresAt)` or `new Date(doc.expires_at)` with `parseLocalDate(expiresAt)` in:

| File | Occurrences |
|------|-------------|
| `InspectionBinderTypes.ts` | `getExpiryStatus()`, `daysUntilExpiry()` |
| `DocRow.tsx` | Display line (~547) |
| `InspectionBinderAdmin.tsx` | Display (~1071), days calculations (~645, ~1369, ~1873, ~1911) |
| `OperatorBinderPanel.tsx` | Display (~259) |

**3. Also check `ComplianceAlertsPanel.tsx` and `InspectionComplianceSummary.tsx`**

These files also parse date strings for compliance calculations — apply the same fix.

### No database changes needed
The dates are stored correctly. This is purely a display/parsing fix.

