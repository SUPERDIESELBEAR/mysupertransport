# Fix: "Failed to send a request to the Edge Function" on Passenger Authorization

## Root cause (confirmed)
The Send Passenger Authorization modal invokes the `send-passenger-auth` edge function, but that function has never been deployed — its logs return "No logs found", which is why the browser gets the generic *Failed to send a request to the Edge Function* error (the function URL 404s before any code runs). The sibling functions created in the same feature (`get-passenger-auth`, `finalize-passenger-auth`) are also new and likely undeployed.

## Fix
1. Deploy the three passenger-authorization edge functions so they become reachable:
   - `send-passenger-auth`
   - `get-passenger-auth`
   - `finalize-passenger-auth`
2. Re-test "Send email" from the Resource Center → Passenger Authorization modal and confirm a 200 response and a row in `passenger_authorizations`.
3. If the call now returns a real error (e.g. missing secret, template not registered), fix that specific error — no other code changes are planned up front.

No file edits are expected; this is a deployment-only fix.
