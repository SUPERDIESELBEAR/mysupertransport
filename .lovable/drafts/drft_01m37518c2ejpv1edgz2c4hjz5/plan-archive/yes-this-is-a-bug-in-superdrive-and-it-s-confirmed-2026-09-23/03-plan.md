
## Technical details

- Cause: `supabase/functions/invite-truck-owner/index.ts`, lines 79–83 and 129–133. The function resolves an existing auth user by email, then unconditionally updates `profiles.first_name/last_name`. It also upserts `user_roles` truck_owner and sets `truck_owners.user_id` to that user.
- Evidence: audit_log shows `profile_name_changed` (Rovelt Laforet to Lonnie Johnson, target 911bfbae…) at 17:09:14 UTC, then `truck_owner_created` by Mae Lauron with owner_user_id 911bfbae… (the operator's own user).
- Function fix: only update the profile name when the user was created in this call. Before resolving the user, reject with 409 and a plain message when the email belongs to the card's operator or to any user holding the operator or staff roles. Surface the error in `TruckOwnerCard.tsx`.
- Data repair for operator a78f06fc: restore his profile name, delete the truck_owner `user_roles` row for 911bfbae, and set `truck_owners.user_id` to null. Every step gets an audit_log entry. First confirm Rovelt has no real truck-owner use.
- Scan: find `profile_name_changed` events that land within seconds of `truck_owner_created`/`invited` for the same user, and report them.
- The edge function goes live when the draft is accepted.