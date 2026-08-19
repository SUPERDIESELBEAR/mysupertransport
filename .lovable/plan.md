# Create Load form + configurable load numbering

Extends the existing Loads work. No changes to `loads`, `load_stops`, or `brokers` structure; the Loads list only gets its "Create Load" buttons wired up.

## Part 1 — Load numbering

New table `load_number_config` (single config row, seeded `ST` / year on / no separator / 3-digit padding / annual reset / sequence 1).

`generate_load_number()` locks the config row, rolls the sequence back to 1 when the year changed and annual reset is on, composes `prefix + optional 2-digit year + separator + padded sequence`, increments, and returns the string. Concurrent dispatchers can never get the same number.

Access: management and owner can read and change the config; dispatchers can read it. The function is callable by signed-in users only.

## Part 2 — Create Load form

One scrolling page (no wizard), reachable from both portals the same way the Loads list is: `/dispatch/loads/new` for Dispatch, and a `load-create` view inside Management. Same charcoal/gold styling and shadcn components used elsewhere.

Sections in order:

1. **Load Type** — Standard (default), Per-Ton Bulk, Trailer Relocation (Loadout). Drives the rest of the form.
2. **Load Details** — auto-generated Load Number (read-only + Regenerate, helper text pointing at settings), searchable Broker select with inline "Add new broker" dialog (company name, MC number, primary contact), Broker's Load #, BOL #, PO #, Equipment Type, Handling Type (hidden and forced to Live Load/Unload for Flatbed and Hopper Bottom), Commodity, Weight (hidden for Loadout).
3. **Reefer Requirements** — only when equipment is Reefer: temp, min, max, pre-cool, continuous run, notes.
4. **Trailer Relocation Details** — only for Loadout: owner company, owner contact, trailer number, VIN, type, relocation fee, use period days, plus helper text that photos serve as proof of delivery.
5. **Rate** — hidden entirely for Loadout; forced to Per Ton (selector disabled) for Per-Ton Bulk. Fields switch per rate type (Flat, Per Mile, Per Ton with estimated tons + scale-ticket helper text, Percentage of Load). FSC bundled toggle defaults on; off reveals an FSC Amount field. Loaded and deadhead miles. A live Total Load Value summary recalculates as the user types.
6. **Stops** — starts with one Pickup and one Delivery. Per stop: facility, address 1/2, city, state, zip, contact name and phone, appointment start and end, notes. Add Stop (Pickup / Delivery / Drop & Hook), remove allowed above two, reorderable; sequence is assigned from display order on save and any middle stop is marked stop-off charge eligible.
7. **Notes and Flags** — internal notes, driver-facing notes, special instructions, Team Load (reveals Co-Driver Name), Hazmat, Permit Required (reveals Permit Cost and Recovery Method: Bill to Broker / Charge to Driver / Absorb).

## Save behavior

Status is always `available` at creation and not selectable. `operator_id` stays null. `dispatcher_id` is set to the creator's profile when they hold the dispatcher role. Load and stops save together — a failure leaves nothing behind and the form keeps everything the user typed, with a clear error. Success shows a toast and goes to the new load's detail page.

## Validation

React Hook Form + Zod, inline messages, scroll to the first error. Required: load number, equipment type, at least two stops, city and state on every stop; linehaul rate for Flat, rate per ton for Per Ton, rate per mile for Per Mile, relocation fee for Loadout, temperature for Reefer.

## Technical details

- Migration: `CREATE TABLE public.load_number_config` -> `GRANT SELECT, UPDATE TO authenticated` / `GRANT ALL TO service_role` (no anon) -> `ENABLE ROW LEVEL SECURITY` -> policies using `public.has_role(auth.uid(), ...)` (select for management/owner/dispatcher, update for management/owner). Seed row inserted in the same migration.
- `public.generate_load_number()` is `SECURITY DEFINER`, `SET search_path = public`, uses `SELECT ... FOR UPDATE` on the config row; `REVOKE EXECUTE FROM public, anon`, `GRANT EXECUTE TO authenticated`.
- Atomic save: supabase-js cannot span a transaction across two inserts, so a second `SECURITY DEFINER` RPC `public.create_load_with_stops(load jsonb, stops jsonb)` inserts the load and its stops in one statement block and returns the new load id. It re-checks the caller is dispatcher/management/owner, forces `status = 'available'` and `operator_id = null`, and derives `stop_sequence` and `stopoff_charge_eligible` server-side. Same search_path pinning and grant rules.
- New files: `src/pages/dispatch/CreateLoadPage.tsx` (form shell + submit), `src/components/dispatch/loadForm/` for the section components, `src/lib/loadRateMath.ts` for the Total Load Value calculation, and a `loadFormSchema.ts` holding the Zod schema with the conditional rules. Broker picker reuses the existing combobox pattern from `src/components/shared/DriverCombobox.tsx`.
- Routing: `DispatchPortal.tsx` gains a `/dispatch/loads/new` branch alongside its existing loads-path handling; `ManagementPortal.tsx` gains a `load-create` view. `LoadsListPage.tsx` changes only where the "Create Load" buttons currently fire a toast — they now navigate, using the same portal-aware pattern already used for row clicks.
- Stops UI uses `useFieldArray`; reorder via up/down buttons (no new drag dependency).
