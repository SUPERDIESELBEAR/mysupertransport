

## Show Driver Docs Before Company Docs (Binder + Flipbook)

### What changes

In every place the binder lists or paginates documents, render **Driver Docs first**, then **Company Docs**. Currently it's Company → Driver in all four surfaces.

### Surfaces affected

| File | What renders today | After |
|---|---|---|
| `src/components/inspection/OperatorInspectionBinder.tsx` (operator portal — what drivers see) | "Company Documents" section, then "My Documents" section, then "My Uploads" | "My Documents" → "Company Documents" → "My Uploads" |
| Same file — Flipbook page array (lines ~424–470) | Cover → company pages → driver pages → uploads | Cover → **driver pages → company pages** → uploads |
| `src/components/inspection/OperatorBinderPanel.tsx` (staff drill-down) — Flipbook page array (lines ~530–560) | Cover → company → driver → uploads | Cover → **driver → company** → uploads |
| `src/components/inspection/InspectionBinderAdmin.tsx` — Flipbook page array (lines ~2281–2323) | Cover → company → driver → uploads | Cover → **driver → company** → uploads |

### Out of scope (unchanged)

- **InspectionBinderAdmin tabs** (the staff editor): the "Company" and "Per-Driver" tabs are independent buttons, not stacked sections — order doesn't apply. We could swap the tab order if you want, but you only mentioned the binder/flipbook viewing experience, so leaving that alone.
- **My Uploads** (driver self-uploads) stays at the bottom in both the operator binder view and the flipbook — it's a separate category and felt natural last.
- No DB changes, no constants changes, no admin reorder UI changes — `driverOrder` and `companyOrder` continue to work exactly as before; we just render them in the new outer sequence.

### Why this is safe

- Pure reordering of JSX blocks and array spreads — no logic, no data, no permissions touched
- Flipbook navigation, share tokens, expiry badges, and selection mode all keep working unchanged
- Cover page still appears first in flipbook



