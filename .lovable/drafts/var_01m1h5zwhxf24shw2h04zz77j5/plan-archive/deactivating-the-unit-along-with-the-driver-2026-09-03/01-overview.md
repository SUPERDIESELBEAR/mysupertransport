# Deactivating the unit along with the driver

Today the deactivation wizard offboards the person and never mentions the truck. Because a unit exists only as fields on the driver record, deactivating a driver silently takes the unit off the Vehicle Hub roster — whether or not the truck is actually leaving the fleet. Nothing records which of those two happened.

This adds one new step to the wizard, **Unit disposition**, placed right after Reason & Date so the answer can shape the rest of the run.

## The question staff answer

**"What happens to Unit 187?"** — one of three:

1. **The truck leaves with the driver.** Owner-operator taking his own truck. The unit is retired with the driver: plate release, ICA void and equipment return stay required, and nothing is held.
2. **The truck stays leased to us — a new driver is coming.** The truck owner keeps the truck on our authority. The unit is **held vacant** with its details captured (unit #, VIN, plate, year/make/model, trailer, truck owner). It leaves the active roster but is not lost, and it prefills when the replacement driver is onboarded.
3. **Not sure yet.** The unit is held vacant and flagged as undecided, so it surfaces for follow-up rather than vanishing.

Choosing option 2 or 3 also softens the downstream steps: the MO plate step offers **"keep the plate with the unit"** instead of pushing a release, and the ICA void step warns that voiding ends the truck owner's lease, which is usually not what you want when only the driver is changing.

## Vacant units in Vehicle Hub

A **Vacant units** section appears above the roster on the Active tab whenever a held unit exists: unit #, truck, truck owner, who last drove it, how long it has been vacant. Each row has **Assign new driver**, which opens the applicant invite with the unit's truck details carried over, and **Release unit**, which drops it from the list with a reason.

When a unit is held, management and onboarding staff also get a notification so an empty truck does not sit unnoticed.

## Not in this build

Replacing the truck itself (same owner, same driver, new truck) stays out — that is an ICA amendment, not a deactivation, and the existing amendment builder already records unit removed / unit added. No standalone truck entity is introduced; drivers still carry their unit.
