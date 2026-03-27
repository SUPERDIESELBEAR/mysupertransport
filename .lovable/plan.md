

## Fix Owner Role Assignment — Marcus Mueller

### Problem
The previous migration incorrectly assigned the `owner` role to Omar Tarar. You (Marcus Mueller) are the actual owner of SUPERTRANSPORT and this app.

### Fix
A single data operation to:
1. **Remove** the `owner` role from Omar Tarar's account
2. **Assign** the `owner` role to Marcus Mueller's account

Marcus will keep the existing `management` role as well, so all admin features continue working. Omar will retain `management` but no longer have `owner` privileges (account deletion).

### Files changed
None — this is a data-only fix using the database insert tool (no schema/code changes needed).

