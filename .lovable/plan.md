# Reactivate a unit from Vehicle Hub

## What's true today (verified)

- Vehicle Hub (`FleetRoster`) already has an **Active / Deactivated** toggle and lists deactivated units, but those rows are read-only — no reactivate action exists anywhere in Vehicle Hub.
- The only reactivation control in the app is in **Driver Hub → Archived Drivers**, and it does exactly two things: set the operator active and write an `operator_reactivated` audit row.
- Vehicle Hub's Active list additionally requires an insurance date on the onboarding record. A unit reactivated without that date would flip to active but still not show up in the Active tab.
- There is no Tracey Dorsey record in the database at all. Unit 187 exists, attached to a different deactivated driver, with no deactivation date recorded — consistent with a pre-wizard, manual deactivation.

## What to build

**1. Reactivate action on deactivated units in Vehicle Hub**

- On the Deactivated tab only, add a "Reactivate unit" action to each card and each list row, for management/owner only, matching the permission checks already used in this view.
- Confirmation dialog naming the unit, the driver, and the deactivation date when known.
- On confirm: reactivate the operator, write the `operator_reactivated` audit entry, refresh both roster lists, and toast.

**2. Say plainly what reactivation does not restore**

The confirmation dialog lists what offboarding tore down so staff know what to redo by hand:

- ICA / lease agreement (must be reissued and signed)
- MO plate assignment (may already be reassigned)
- Onboard systems: ELD, dash cam, BestPass, fuel card
- Compliance docs: CDL, med cert, IRP, 2290, insurance — likely expired
- Driver login, if access was revoked

**3. Make a reactivated unit actually reappear**

If the unit has no insurance date on record it will stay hidden from the Active tab. After reactivation, when that date is missing, show a follow-up prompt linking to the driver's onboarding record, and flag the unit in the Active list as "Insurance date missing".

## For a driver like Tracey who predates the system

No operator record exists, so there is nothing to reactivate — she goes through the normal add-driver / onboarding path. This plan covers units deactivated inside SUPERDRIVE.

## Technical notes

- Changes stay in `src/components/fleet/FleetRoster.tsx` plus a small confirm dialog; the reactivation write mirrors the existing logic in `src/components/drivers/ArchivedDriversView.tsx`.
- No schema changes, no new tables or policies.

## Not included

A full Reactivation Wizard (re-verify docs, reissue ICA, reassign plate and onboard systems, archive the old termination) is a larger separate build. Say the word and I'll plan it next.