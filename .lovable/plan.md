# Create Load failure — diagnosis

## Root cause (confirmed)

`create_load_with_stops` inserts `created_by` and `updated_by` as `auth.uid()`, but both columns are foreign keys to `profiles(id)` — and in this database `profiles.id` is never the auth user id (163 profile rows, 0 where `id = user_id`; your own profile is `a9f93d0a-…` for auth user `5cca4f77-…`).

So every call fails on the **loads insert** with a foreign-key violation:

```text
23503 — insert or update on table "loads" violates foreign key
        constraint "loads_created_by_fkey"
```

The failure happens before the stops loop, inside a single function call, so the whole statement rolls back: **no partial data was written** (no orphan load, no stops, the load number sequence was already consumed by the earlier `generate_load_number()` call, which is expected behavior).

## Why the toast says nothing useful

The client does `catch (e) { e instanceof Error ? e.message : 'Could not create the load.' }`. A supabase-js `PostgrestError` is a plain object, not an `Error` instance, so the real message, `code`, `details`, and `hint` are all discarded and the generic fallback is shown. That is why the console/network snapshot has no Postgres error text.

## Everything else checked out

- **Payload keys**: every key the form sends maps to a `p_load->>'…'` / stop key the function reads. No mismatches.
- **NOT NULL columns**: only `load_number` (sent), plus columns with defaults (`status`, `load_type`, `rate_type`, timestamps) and stop `load_id` / `stop_sequence` / `stop_type`, all set server-side.
- **Enums**: cast explicitly in the function (`::load_type`, `::equipment_type`, `::load_handling_type`, `::rate_type`, `::stop_type`), values match the enum labels.
- **Empty numerics**: the form sends `''` and the function wraps each in `NULLIF(..., '')::numeric`, so blanks become NULL correctly.
- **Timestamps**: `toIso()` sends ISO-8601 or `''`; `NULLIF(...)::timestamptz` accepts both.
- **Role check**: passes — `generate_load_number()` succeeded and you hold management/owner.
- **Triggers**: `loads` and `load_stops` have only BEFORE/AFTER **UPDATE** triggers, none on INSERT.

## Payload shape the form sends

`p_load` — one flat JSON object, all values strings/booleans:
`load_number, load_type, broker_id, broker_reference_number, dispatcher_id, equipment_type, handling_type, commodity, weight_lbs, bol_number, po_number, rate_type, linehaul_rate, rate_per_mile, rate_per_ton, estimated_tons, fsc_bundled_into_linehaul, fsc_amount, loaded_miles, deadhead_miles, total_load_value, reefer_* (6), loadout_* (7), internal_notes, driver_facing_notes, special_instructions, is_team_load, co_driver_name, is_hazmat, permit_required, permit_cost, permit_recovery_method` — unused fields sent as `''`.

`p_stops` — array of `{ stop_type, facility_name, address_line1, address_line2, city, state, zip, contact_name, contact_phone, appointment_start, appointment_end, stop_notes }`.

Example (standard flat-rate load):

```text
p_load: { load_number: "ST26-004", load_type: "standard", broker_id: "",
          dispatcher_id: "", equipment_type: "dry_van",
          handling_type: "live_load_unload", rate_type: "flat",
          linehaul_rate: "2500", fsc_bundled_into_linehaul: true,
          total_load_value: "2500", weight_lbs: "", ...rest "" }
p_stops: [ { stop_type: "pickup",  city: "Kansas City", state: "MO", ... },
           { stop_type: "delivery", city: "Dallas",     state: "TX", ... } ]
```

## Proposed fix (not implemented — awaiting approval)

1. **Database**: change `create_load_with_stops` so `created_by` / `updated_by` resolve the caller's profile id — `(SELECT id FROM public.profiles WHERE user_id = auth.uid())` — instead of `auth.uid()`. No schema change, no form change.
2. **Client error surfacing**: replace the `instanceof Error` narrowing in `CreateLoadPage.tsx` with a small helper that reads `message`, `code`, `details`, and `hint` off a PostgrestError-shaped object and shows them in the toast, plus a `console.error` with the full error and the exact payload. Reusable for the rest of the TMS work.

Optional follow-up worth deciding on: `dispatcher_id` is already resolved to a profile id in the client, so it is consistent with the FK — but the same profile lookup could move server-side for symmetry.
