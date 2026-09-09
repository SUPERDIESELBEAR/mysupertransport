# Binder documents: always show the newest, keep the older ones

## What actually happened with Alexander White

The replacement did happen — partly. His new September 9 certificate was recorded on the truck, and his binder row was updated to point at the new file. But the binder screen shows documents using a saved link, and only the file location was refreshed, not the link. So the binder kept displaying the February certificate.

Two confirmed defects behind it:

1. When a new inspection is saved in the Vehicle Hub, the binder's stored **link** is only replaced if the Vehicle Hub record has one. Uploads made in the Vehicle Hub save a file location but no link, so the binder keeps the old link and keeps showing the old document.
2. The file location written into the binder is saved with an extra prefix, which makes the binder look for the file in the wrong storage area. Even the "view by location" path fails for these rows.

## Who else is affected

- 94 drivers have a Periodic DOT Inspections row; 90 of them carry the prefixed location.
- 6 of those are actively showing the **wrong (older) certificate** today, including Alexander White. The other 84 happen to still be on their original document, so nothing looks wrong yet — but the next Vehicle Hub replacement would break them the same way.
- No other binder document type (CDL, Medical, IRP, 2290, Lease, Insurance, IFTA) shows this mismatch today.

## Where each document can be updated (confirmed)

The binder is not the only door a new file can come through:

- **CDL, Medical Certificate** — the driver's application and onboarding retakes, plus a staff Replace in the binder.
- **IRP Registration (cab card), Form 2290** — onboarding uploads, the Vehicle Hub's Registration / 2290 section, and the binder.
- **Lease Agreement (ICA)** — ICA signing files the executed agreement, plus the binder.
- **Periodic DOT Inspections** — the Vehicle Hub and onboarding Stage 5 uploads, plus the binder (currently read-only there).
- **Insurance, IFTA, UCR, MC Authority, permits, ELD Procedures** — company-wide; only managed in the binder's Company tab, as one shared file for everyone.

Every one of these doors writes the same binder record, so an archive attached to that record captures history no matter where the new file came from, and every screen that reads it (binder, Vehicle Hub, Driver Hub, Fleet Compliance, roadside sharing) shows the same newest version.
