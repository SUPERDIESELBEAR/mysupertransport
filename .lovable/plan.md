## Short answer for your assistant

Yes — the ICA will go to **David Mitchell**, not Kevin Foy. The wording on the final step is wrong, not the routing.

Verified in the code:
- `send-notification` (milestone `ica_sent`) looks up the `truck_owners` row for the operator first. When one exists (David, linked on Kevin's profile), the signature email goes to the owner's address, not the driver's.
- `OperatorICASign` resolves the signed-in user as either `driver` or `truck_owner`. A truck-owner signer gets "This ICA is ready for your signature", can correct their contact fields, and writes `contractor_signed_at`.
- Kevin, as the driver on an owner-signed ICA, gets the read-and-acknowledge card (`DriverICAAcknowledgment`) — not the signature block.

One thing to confirm before sending: David must have an actual login (`truck_owners.user_id` populated via the Invite Truck Owner action on his card). If he has never been invited, the email lands but he has nowhere to sign.

## What to change

Step 4 of the ICA builder is hardcoded to the driver's name and the word "operator". Make it reflect the real signer.

### `src/components/ica/ICABuilderModal.tsx`
1. Keep the `truck_owners` row already fetched in `loadDraft` in state (name, email, `user_id`) instead of discarding it after pre-fill. Also select `user_id`.
2. Derive a `signer` value: the truck owner when a row exists, otherwise the operator.
3. Step 4 rewrite:
   - Heading: "Ready to send to truck owner" / "Ready to send to operator".
   - Body: "**David Mitchell** (truck owner) will review the full agreement and sign digitally from their portal. **Kevin Foy** will be notified to read and acknowledge the executed ICA."
   - Add a "Signature Required From" summary row showing the signer's name and email, alongside the existing Operator row so both parties are visible.
   - If the owner row has no `user_id`, show an amber inline warning: "David Mitchell has not been invited yet — send the truck-owner invite so he can sign." with a pointer to the Truck Owner card.
4. Update the footer send button label and the success toast to name the actual recipient ("ICA sent to David Mitchell").
5. Step 3 carrier-signature disclaimer ("will be sent to the operator") gets the same signer-aware wording.

### Notes
- No routing, database, or edge-function changes — delivery is already correct.
- Copy-only change plus one extra selected column and a piece of local state.
