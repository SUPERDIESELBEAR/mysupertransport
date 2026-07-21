## Goal
Fix the Passenger Authorization submit failure that occurs when the contractor uses the new passenger-signature waiver flow.

## Confirmed signals
- The latest failed submit reached `finalize-passenger-auth` and returned HTTP `400`.
- The latest Marcus Mueller authorization is still `opened`, with no executed PDF filed.
- The new database fields for `passenger_relationship`, `passenger_signature_waived`, and `passenger_waiver_reason` exist.
- The current signing page sends `passengerSignatureWaived: true` when the passenger is not present, and omits `passengerTypedName` / `passengerSignature` as intended.

## Likely fix
The deployed `finalize-passenger-auth` function is rejecting waived submissions before upload/update. I’ll make the function validation explicitly support both waiver cases:
- Minor child: no passenger signature required; reason auto-set.
- Passenger not present: no passenger signature required, but waiver reason required.
- Standard flow: passenger typed name and passenger signature still required.

## Implementation steps
1. Update `supabase/functions/finalize-passenger-auth/index.ts` validation to derive:
   - `isMinor` from the relationship value/label
   - `waived` from either the explicit waiver flag or minor-child relationship
   - `waiverReason` with a default minor-child reason when applicable
2. Ensure the function persists the waiver fields consistently:
   - `passenger_signature_waived`
   - `passenger_waiver_reason`
   - `passenger_signature_url` remains null for waived/minor cases
3. Improve the returned error message for invalid submissions so the UI can show the exact missing field instead of the generic edge-function message.
4. Deploy `finalize-passenger-auth`.
5. Test the deployed function with a safe payload shape that mirrors the waived case, and verify the function no longer rejects waived submissions at validation.

## Files expected to change
- `supabase/functions/finalize-passenger-auth/index.ts`
- Potentially `src/pages/PassengerAuthSign.tsx` only if the client needs to send the relationship value instead of the display label for more reliable validation.