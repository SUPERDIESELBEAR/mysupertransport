## Technical change

**`src/pages/management/ManagementPortal.tsx`** — in the `Drivers` nav group, change the item label at the `eld-logs` entry from `'Driver Logs (RODS)'` to `'Paper Logs (RODS)'`. The `path`, icon, and view routing are untouched.

No changes to the view id (`eld-logs`), `ALLOWED_VIEWS`, deep-link handling of `?view=eld-logs&op=…`, the database, or the operator portal.

## Verification

Open the Management portal and confirm the Drivers group shows **Paper Logs (RODS)** and that clicking it still opens the logs screen, including a refresh with a driver deep link.
