

## Standardize Timezone to US Central Time

### Problem
The birthday/anniversary cron job was scheduled at 9 AM UTC. The app operates on US Central Time (as evidenced by existing `America/Chicago` usage in `send-notification`). The cron job and the edge function's date logic both need to use Central Time.

### Changes

**1. Edge function: `supabase/functions/send-birthday-anniversary/index.ts`**
- Change `new Date()` to use Central Time when extracting month/day, so the function checks "today in Central Time" rather than UTC:
  ```ts
  const now = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  ```
- This ensures birthday/anniversary matching is correct even when UTC date differs from Central date.

**2. Re-schedule the cron job**
- Delete the existing `send-birthday-anniversary-daily` cron entry
- Re-create it at `0 15 * * *` (3 PM UTC = 9 AM CT during CDT) or `0 14 * * *` (2 PM UTC = 9 AM CT during CST, 10 AM during CDT)
- Since `pg_cron` runs in UTC, a fixed offset is needed. Using `0 15 * * *` (15:00 UTC) gives 9 AM CDT / 8 AM CST — close enough for a daily greeting. Alternatively `0 14 * * *` gives 9 AM CST / 10 AM CDT.
- Recommend **`0 15 * * *`** so greetings arrive by 9 AM during the majority of the year (CDT runs March–November).

**3. Verify other cron jobs**
- `check-cert-expiry` and `check-inspection-expiry` — if they have cron schedules set via SQL inserts, update them to Central Time equivalents as well.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/send-birthday-anniversary/index.ts` | Use `America/Chicago` timezone for date logic |
| SQL (via insert tool) | Reschedule cron job to `0 15 * * *` (9 AM CDT); update any other existing cron jobs similarly |

