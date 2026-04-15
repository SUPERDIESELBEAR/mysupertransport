

## Snapshot Insurance Data in Audit Log

### Problem
When the Stage 6 insurance email is sent, the stated value and truck details are pulled live from the database. There is no record of exactly what values were communicated. If the data changes later, the original values are lost.

### Solution
Expand the `metadata` object in the existing audit log entry (written by `send-insurance-request`) to include all key insurance data sent in the email. This requires no new tables or migrations — the audit log's `metadata` JSONB column already stores arbitrary data.

### Change

**`supabase/functions/send-insurance-request/index.ts`** — line 260

Update the audit log insert to snapshot the insurance values that were included in the email:

```typescript
metadata: {
  recipients,
  policy_type: policyType,
  stated_value: os?.insurance_stated_value ?? null,
  truck_vin: os?.truck_vin || ica?.truck_vin || null,
  truck_year: os?.truck_year || ica?.truck_year || null,
  truck_make: os?.truck_make || ica?.truck_make || null,
  notes: os?.insurance_notes ?? null,
  ai_company: ai.company,
  ch_company: ch.company,
  email_error: emailError,
}
```

This means every time the insurance email is sent, the exact stated value, truck info, and recipient list are permanently recorded in the audit log — visible in the Activity Log under Management.

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Expand audit log metadata to include stated value, truck info, and insurance details |

