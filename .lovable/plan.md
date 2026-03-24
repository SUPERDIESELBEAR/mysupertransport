
## Change "Drivers" to "Driver Hub" in the nav bar

Two files need a label update — nothing else changes.

**`src/pages/staff/StaffPortal.tsx` — line 148**
```
{ label: 'Drivers', ... }  →  { label: 'Driver Hub', ... }
```

**`src/pages/management/ManagementPortal.tsx` — line 674**
```
{ label: 'Drivers', ... }  →  { label: 'Driver Hub', ... }
```

No database, routing, or logic changes needed. The internal path key stays `'drivers'` — only the display label changes.
