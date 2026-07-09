## Change

In `src/pages/management/ManagementPortal.tsx` sidebar `navItems` (line 846), move the **Equipment** and **MO Plate Registry** entries out of the Admin section and into the Operations section, placing them right after **Document Hub** and before the `Resource Center` item (which carries the `dividerBefore: 'Admin'` marker).

## New order under Operations

```text
Compliance   (dividerBefore: 'Operations')
Dispatch Board
Driver Hub
Vehicle Hub
Inspection Binder
Document Hub
Equipment          ← moved
MO Plate Registry  ← moved
Resource Center    (dividerBefore: 'Admin')
...
```

No other logic, routes, or components change — this is a pure sidebar reordering.