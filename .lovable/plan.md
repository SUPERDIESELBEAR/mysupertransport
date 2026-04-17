

## Remove "Accident Packet" from Inspection Binder → Move to Resource Center

### What changes

**1. Remove from Inspection Binder constants**
- `src/components/inspection/InspectionBinderTypes.ts` — drop the `Accident Packet` entry from `COMPANY_WIDE_DOCS` (line 40). All admin/operator/flipbook/share/compliance views read from this list, so the slot disappears everywhere automatically.

**2. Migrate the existing PDF to Resource Center**
There is already one Accident Packet uploaded in the company binder (file URL: `inspection-documents/company/accident-packet/1774527172990.pdf`). The migration will:
- Insert a row into `resource_documents` with:
  - `title`: "Accident Packet"
  - `category`: `forms_compliance` (matches the "Forms & Compliance 📋" tab in Resource Center → Company Documents)
  - `file_url`: existing signed URL (or re-sign from the file path)
  - `is_visible`: true, `sort_order`: 0
- Delete the row from `inspection_documents` so the binder no longer shows it
- Leave the actual file bytes in storage (no destructive deletion). Operators will reach it via Resource Center → Company Documents → Forms & Compliance.

**3. Clean any saved binder ordering**
- `src/hooks/useBinderOrder.ts` and the `inspection_binder_order` DB rows reference doc keys. Since we just remove the key from `COMPANY_WIDE_DOCS`, any stale `"Accident Packet"` entry in saved order arrays will be silently skipped on render — no migration required for the order table.

### Files / changes summary

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderTypes.ts` | Remove `Accident Packet` from `COMPANY_WIDE_DOCS` |
| Migration | Insert into `resource_documents` (Forms & Compliance), delete from `inspection_documents` |

### Why this is safe
- Pure removal from a constant array → all binder UIs (operator portal, flipbook, share page, compliance summary, alerts, admin Company tab) drop it automatically
- Existing file is preserved in storage; we just point to it from the Resource Center
- Operators get one less item in their binder, plus a visible entry in Resource Center → Forms & Compliance

### Out of scope
- Renaming/recategorizing other binder docs
- Building a generic "move binder doc to Resource Center" UI (one-time relocation only)

