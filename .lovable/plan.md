

## Auto-Normalize ALL CAPS Input + Fix Bobby Thompson's Existing Data

### Problem
Bobby Thompson submitted his application with ALL CAPS ("BOBBY THOMPSON", "TUPELO"). There is no automatic normalization, so whatever casing the applicant types gets stored as-is.

### Solution — Two parts

**1. Auto-normalize on input (prevent future ALL CAPS)**

Add a `toTitleCase()` utility that converts text like "BOBBY" → "Bobby" and "MCDONALD" → "McDonald". Apply it automatically in the `buildPayload()` function to all name and address fields before saving to the database. This way the applicant can type however they want, but data is always stored in proper title case.

Fields normalized: `first_name`, `last_name`, `address_street`, `address_line2`, `address_city`, `prev_address_street`, `prev_address_line2`, `prev_address_city`, and employer names/cities.

**2. Fix Bobby Thompson's existing data**

Update his application record from "BOBBY THOMPSON" / "TUPELO" to "Bobby Thompson" / "Tupelo" using a data update.

---

### Technical details

**New utility** in `src/components/application/utils.ts`:
```ts
function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => 'Mc' + c.toUpperCase());  // McDonald, McGregor
}
```

**`buildPayload()`** — wrap name/address string fields with `toTitleCase()` before returning them in the payload object.

**Data fix** — update Bobby Thompson's application record (id: `a9d87013-...`) to proper casing.

### Files changed

| File | Change |
|------|--------|
| `src/components/application/utils.ts` | Add `toTitleCase()`, apply it in `buildPayload()` to name/address fields |
| Database update | Fix Bobby Thompson's existing record to proper title case |

