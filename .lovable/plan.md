

## Fleet Compliance View — Cleaner Layout and Human-Readable Dates

### Problems Identified

1. **Confusing sort order** — Currently sorted purely by urgency tier then days-until-expiry, which interleaves different drivers' CDL and Med Cert rows randomly. A driver with an expiring CDL could be 20 rows away from their Med Cert.
2. **Status shows raw day counts** — Badges show `"342d"` or `"15d ago"` which is hard to parse at a glance. The `formatDaysHuman` utility already exists but isn't used here.

### Recommendations and Changes

**Default view: Group by operator, fleet docs on top**
- Fleet-wide rows (Insurance, IFTA) stay at the top as a distinct group
- Then operators are sorted by their *worst* document status (expired operators first, valid operators last)
- Within each operator, CDL and Med Cert appear together — so you see the full picture for each driver at a glance
- This eliminates the scattered feel and makes it scannable

**Human-readable time display**
- Replace `"342d"` with `"11m 12d"` and `"15d ago"` with `"15d ago"` (short durations stay as days)
- Import and use the existing `formatDaysHuman()` from `InspectionBinderTypes.ts`
- Apply to both the badge text and the tooltip

### Technical Details

| Area | Change |
|------|--------|
| `InspectionComplianceSummary.tsx` — sort logic (lines 196–204) | Split fleet rows to top, then group remaining by operator. Sort operators by worst status tier, then alphabetically. Within each operator, order CDL before Med Cert. |
| `InspectionComplianceSummary.tsx` — status badges (lines 588–597) | Replace `${entry.daysUntil}d` with `formatDaysHuman(entry.daysUntil)` for both positive and negative values |
| `InspectionComplianceSummary.tsx` — tooltips (lines 601–607) | Update tooltip text to use human-readable format |
| `InspectionComplianceSummary.tsx` — import | Add `formatDaysHuman` to the existing import from `./InspectionBinderTypes` |

### Single file change
Only `src/components/inspection/InspectionComplianceSummary.tsx` is modified. No database changes needed.

