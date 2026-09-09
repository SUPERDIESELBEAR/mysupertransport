# Driver binder uploads with staff approval, plus compliance auto-refresh

The two cards you screenshoted were suggestions — neither was built. Here is what the code already does, and what this plan adds.

## Already working today (no build needed)

- Drivers can already **view their own binder documents** in the driver app, with an "N Expiring / All Clear" alert summary.
- Once you accept the current draft, the **History** button appears there too, so drivers can view their own prior versions.
- **Fleet Compliance already refreshes automatically**: it reads live from the same binder records, so any expiry change — including a new uploaded version — updates the compliance alerts without anyone touching the Fleet Compliance page.

## What this plan adds

### 1. Drivers can upload a new version of an expiring document

In the driver's binder, four renewable documents get an **Upload new version** button:

- CDL
- Medical Certificate
- IRP Registration (cab card)
- Form 2290

The driver picks the file and enters the **new expiry date** (required — this is what clears the compliance alert later). The Lease Agreement stays staff-only; it comes from contract signing.

### 2. Staff approve before anything changes

Per your choice, a driver upload does **not** replace the binder document right away:

- The upload lands in a **pending review** state, shown to staff in the Fleet Compliance area (and as a badge on the driver's row).
- Staff see the new file and the driver's entered expiry side by side, then **Approve** or **Reject** (with a note back to the driver).
- On approve: the binder slot updates to the new file + new expiry in one step, the old file is archived to History automatically (using the version history from the current draft), the compliance alert clears, and the driver is notified.
- On reject: the binder is untouched and the driver sees why.

### 3. Compliance alerts always reflect the binder

A verification pass over every place a binder file or expiry can change (driver upload approval, staff replace, Vehicle Hub inspection, onboarding sync) to confirm each one writes file **and** expiry together, so no alert is left stale. Any path found updating one without the other gets fixed in the same pass.

## What this does not change

- No changes to what drivers can see: still strictly their own documents.
- No changes to company-wide documents (Insurance, IFTA) — staff-managed as today.
- The version-history storage from the current draft is unchanged; this plan builds on it.
