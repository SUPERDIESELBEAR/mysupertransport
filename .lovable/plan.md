## Answers

**1. Can existing drivers be marked as Demo?** Yes. Marcus Mueller, Emma Mueller, Craig Pate, Omar Tarar, and King Kong all exist as operator records today with the demo flag off. Turning it on is a flag change, not a rebuild — no data is deleted and nothing about their history changes. It only affects: they disappear from live rosters/pipeline/compliance unless "Show demo accounts" is on, they get a purple DEMO badge, and any email meant for them is rerouted to whoever triggered the send. It's fully reversible.

One caution: Marcus Mueller is the owner account. Flagging it demo would hide it from staff-facing driver lists and reroute its mail — usable, but worth deciding deliberately.

**2. Do demo accounts get new features automatically?** Yes. Demo drivers are real records in the same database running the same code — there's no separate copy or sandbox build. Every published feature, UI change, migration, and email template applies to them the moment it goes live. The only intentional differences are visibility filtering, email rerouting, and exclusion from scheduled jobs and analytics.

## Plan: convert existing drivers to/from demo

**1. Backend action**
Add a `set-demo-flag` edge function (management/owner only, same auth pattern as `provision-demo-driver`) that takes an operator id, a target on/off state, and an optional demo label. It sets `is_demo` consistently across the operator record, its linked application, and the driver's profile so email safety and visibility filters all agree. Turning demo off clears the label and scenario but touches nothing else.

**2. UI in Management → Demo Accounts**
- New "Convert existing driver" button next to "New demo driver".
- Dialog with a searchable driver picker (active + inactive operators, demo ones excluded), an optional demo label field, and a plain-language warning describing exactly what changes.
- On the existing demo cards, add a "Return to live" action with a confirm dialog that removes the demo flag.
- Guard the owner account with an extra confirmation line so it can't be flagged by accident.

**3. Scenario reset stays optional**
Converting a real driver does not reset or reseed them — their current state is preserved. The scenario reset control remains available on the card if you later want to snap them to a preset, with a clear warning that reset is destructive.

### Technical notes
- No schema migration needed; the `is_demo` columns and the `enforce_demo_flag_management_only` trigger already exist and already restrict flag changes to management/owner.
- The function runs with service role, so the trigger's role check is bypassed at the database level — authorization is enforced in the function via `getClaims` before any write, matching the existing demo functions.
- Files touched: new `supabase/functions/set-demo-flag/index.ts`, and `src/components/management/DemoAccountsPanel.tsx`.
