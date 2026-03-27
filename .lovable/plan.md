

## Support Front & Back CDL in the Inspection Binder

### Current state
- **Application form** already captures `dl_front_url` and `dl_rear_url` separately — no changes needed there.
- **Inspection Binder** stores one row per document name per driver in `inspection_documents`. The "CDL" slot holds a single file. There's no way to attach a second image (back side).

### Proposed approach

Split the single "CDL" slot into two slots: **"CDL (Front)"** and **"CDL (Back)"**. Both share the same expiry date behavior.

**1. Update `src/components/inspection/InspectionBinderTypes.ts`**
Replace the `CDL` entry in `PER_DRIVER_DOCS` with:
```
{ key: 'CDL (Front)', hasExpiry: true },
{ key: 'CDL (Back)', hasExpiry: true },
```

**2. Update `src/components/inspection/InspectionComplianceSummary.tsx`**
- Update the `DocKey` type and compliance logic to reference `'CDL (Front)'` instead of `'CDL'`
- The compliance summary can treat either front or back as the CDL expiry source (front is sufficient since the expiry date is the same on both sides)

**3. Update `src/components/inspection/ComplianceAlertsPanel.tsx`**
- Update the `doc_type` references from `'CDL'` to `'CDL (Front)'` (or handle both)

**4. Existing data migration**
- Any existing `inspection_documents` rows with `name = 'CDL'` should be renamed to `'CDL (Front)'` via a one-time data update so they aren't orphaned

### No schema changes needed
The `inspection_documents` table already supports arbitrary `name` values — this is purely a UI/constant change plus a small data rename.

### Files changed
| File | Change |
|------|--------|
| `src/components/inspection/InspectionBinderTypes.ts` | Split CDL into CDL (Front) + CDL (Back) |
| `src/components/inspection/InspectionComplianceSummary.tsx` | Update CDL references |
| `src/components/inspection/ComplianceAlertsPanel.tsx` | Update CDL doc_type references |
| Data update | Rename existing `name='CDL'` rows to `'CDL (Front)'` |

