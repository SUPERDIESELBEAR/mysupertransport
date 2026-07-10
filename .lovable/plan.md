## Goal

Every management page header shows exactly one icon, in the same style, matching its sidebar entry.

Standard pattern (already used on most pages like Overview, Onboarding Pipeline, Resource Library, etc.):

```tsx
<h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
  <Icon className="h-6 w-6 text-gold shrink-0" />
  Page Title
</h1>
```

Sidebar icons stay unchanged (they set the source of truth); page headers are aligned to them.

## Fixes

1. **Driver Hub** — `src/components/drivers/DriverHubView.tsx` (~lines 274–287)
   - Duplicate `Users2`: one in a `h-9 w-9 rounded-lg bg-primary/10` box, one inside the `<h1>`.
   - Remove the outer icon box wrapper; keep only the `Users2` inside the `<h1>` (already `h-6 w-6 text-gold`).

2. **Vehicle Hub** — `src/components/fleet/FleetRoster.tsx` (~lines 278–289)
   - Duplicate `Truck`: one outside (`text-primary`) and one inside `<h1>` (`text-gold`).
   - Remove the outer `<Truck className="h-6 w-6 text-primary" />`; keep the gold one inside the heading.

3. **DOT Inspection Binder** — `src/components/inspection/InspectionBinderAdmin.tsx` (~lines 1202–1213)
   - Two different icons: `FileText` in a gold rounded box + `Shield` inside `<h1>`. Sidebar uses `Shield`.
   - Remove the `FileText` box wrapper; keep only `<Shield className="h-6 w-6 text-gold shrink-0" />` inside the `<h1>`.

4. **MO Plate Registry** — `src/components/mo-plates/MoPlateRegistry.tsx` (~lines 352–355)
   - Currently `<h2>` with `Car h-5 w-5 text-primary` (smaller and wrong color).
   - Change to `<h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">` with `<Car className="h-6 w-6 text-gold shrink-0" />` to match other headers.

5. **Pipeline Config** — `src/components/management/PipelineConfigEditor.tsx` (~lines 440–443)
   - Currently `<Settings2 className="h-5 w-5 text-muted-foreground" />` (gray, small).
   - Change to `<Settings2 className="h-6 w-6 text-gold shrink-0" />`.

## Out of scope

- Sidebar icons (already correct — they're the reference).
- Other page headers already matching the standard pattern (Overview, Onboarding Pipeline, Resource Library, Forms Catalog, Announcements, Messages, Compliance, FAQ Manager, Notification History, Staff Directory, Onboard Systems, etc.).
- Non-header uses of these icons (buttons, cards, list rows).

## Verification

After edits: visually confirm each of the five pages shows exactly one gold `h-6 w-6` icon left of its title, matching the sidebar glyph.
