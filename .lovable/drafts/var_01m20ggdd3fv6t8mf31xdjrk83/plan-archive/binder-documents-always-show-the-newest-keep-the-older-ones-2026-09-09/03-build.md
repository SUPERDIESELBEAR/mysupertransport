## What to build

### 1. Make replacement reliable (the actual bug)

- Saving an inspection in the Vehicle Hub replaces **both** the binder's stored link and its file location, never one without the other.
- Stop writing the extra storage prefix into the binder location, so the file is always found where it really lives.
- Same treatment in reverse: uploading a new certificate anywhere it can be uploaded ends with one consistent, current pair.

### 2. Version history on every binder slot

A new record of prior versions, applied to all binder documents — not just DOT inspections. Each slot keeps: the file, when it was uploaded, who uploaded it, and the expiry date that was in force.

- Whenever a binder slot is replaced (staff replace, driver upload, onboarding sync, Vehicle Hub inspection), the outgoing copy is archived first.
- The binder row shows the newest document exactly as today, plus a small **History** control listing earlier versions with date and uploader. Each one opens in the same viewer.
- Nothing is deleted. Old files stay in storage.

### 3. History visible in the other hubs

Since the history is stored centrally per document, the same list can be surfaced wherever that document already appears:

- **Vehicle Hub** — the DOT Periodic Inspections list already keeps every inspection; each row links to its own certificate, and past certificates stay reachable there.
- **Driver Hub / operator document panels** — a History control on CDL, Medical Certificate, IRP, Form 2290 and Lease rows, reading the same archive.
- **Operator portal** — drivers see their own history read-only; no cross-driver visibility.

### 4. One-time repair

- Strip the bad prefix from all 90 DOT binder locations.
- For the 6 drivers currently showing an older certificate (Alexander White, plus 5 others), point the binder at the correct current file and archive the superseded one as a prior version so nothing is lost.
- Seed history for every existing binder document with its current file as version 1, so the History control is never empty.

## Verification

- Save a new inspection for Alexander White in the Vehicle Hub, confirm the binder immediately shows the September 9 certificate and lists the February one under History.
- Confirm the other 5 repaired drivers open the correct file.
- Confirm a normal binder replacement (e.g. Medical Certificate) archives the old copy and shows the new one.
