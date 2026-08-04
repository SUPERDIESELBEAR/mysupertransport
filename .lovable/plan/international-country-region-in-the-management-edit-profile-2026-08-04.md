# International Country + Region in the Management Edit Profile

## What changes

The staff Edit Profile popup gets a **Country** dropdown above the location field. Once a country is picked, the second field shows that country's own states/provinces/regions. If a country has no standard region list, the second field becomes a free-text "Region / Province" box instead.

The phone field also stops forcing the US 10-digit format: US/Canada keeps the familiar `(816) 500-7071` mask, any other country accepts a free-form international number (e.g. `+44 20 7946 0958`).

Nothing in the driver app changes — the driver version of this popup keeps the current US-states-only behavior.

## Behavior details

- Country defaults to **United States** for existing staff, so nobody's saved state is lost.
- Changing country clears the region selection (prevents "MO" sticking under Germany).
- Country list is the full world list, sorted alphabetically, with a type-to-search box since it's long.
- Region label adapts: "State" for US, "Province" for Canada, "State / Province" elsewhere.
- Region stays optional, same as today.

## Where the data goes

Staff profiles gain a **country** field alongside the existing home state. Existing rows are backfilled to United States. Lists that display a staff member's location (roster, pipeline) continue to read the state field exactly as they do now, so no display regressions.

## Technical notes

- New file `src/lib/countryRegions.ts`: ISO-3166 country list with subdivision arrays, sourced from a small static dataset dependency (e.g. `country-state-city`) so we don't hand-maintain 195 lists.
- New `home_country` column on `public.profiles` (text, default `'US'`), backfilled for existing rows; profiles already has RLS and grants, so no policy change needed.
- `src/hooks/useAuth.tsx`: add `home_country` to the profile select and the `Profile` type.
- `src/components/EditProfileModal.tsx`: add an `allowInternational?: boolean` prop defaulting to `false`. Only `StaffLayout.tsx` passes `true`. When false the component renders exactly the current US-only state select and US phone mask, so `OperatorPortal.tsx` (driver) is untouched.
- Country picker uses the existing shadcn `Command` + `Popover` combobox pattern for searchability rather than a raw `Select`.
- Phone: keep `formatPhone` for `US`/`CA`; otherwise store the trimmed raw string, validated as max 25 chars matching digits, spaces, `+`, `-`, `(`, `)`.
- Save writes `home_country` and `home_state` together in the existing single `profiles` update.

## Verification

Open the staff Edit Profile popup, switch country to a non-US country, confirm the region list swaps, save, reopen and confirm both values persisted. Then open the driver app profile popup and confirm it is unchanged.