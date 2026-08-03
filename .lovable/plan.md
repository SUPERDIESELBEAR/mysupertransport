# Truck-Owner ICA Signing — One Signer, Auto-Filed to the Driver's Binder

## The problem, confirmed in the live data

For Kevin Foy (driver) and David Mitchell (truck owner, The Country Club of Rebecca LLC):

- **Two ICA notices go out.** A database trigger fires whenever the ICA status flips to "sent for signature" and always emails the *driver* an "Action Required: Review & Sign My ICA" message. Separately, the ICA Builder sends its own notice that correctly looks up the truck owner and goes to *David*. Neither knows about the other, so both men get told to sign.
- **The wrong person can sign.** The driver's ICA screen resolves the signer by whoever is logged in and defaults to "driver", so Kevin sees a full signature pad. Only after the contract is executed does the read-and-acknowledge card appear instead.
- **Nothing files the signed ICA.** The ICA is print-only — no PDF is ever stored. Kevin's DOT Inspection Binder has zero documents; the per-driver "Lease Agreement" slot is empty and would have to be filled by hand.

## What we're building

**One signer.** When a unit has a linked truck owner, the ICA is addressed to the owner only. The owner gets the signature request; the driver gets nothing about signing.

**The driver is silent.** No ICA emails, no ICA in-app notifications, no ICA "action required" badge for the driver. The executed agreement simply appears in their binder and documents.

**No acknowledgment step.** The owner's signature alone completes the ICA. The read-and-acknowledge card is removed from the driver portal.

**Auto-file to the binder.** The moment the owner signs, the system renders the fully executed ICA to PDF and files it into the driver's binder under **Lease Agreement (ICA)**. Staff keep a Replace action on that slot for corrections and amendments.

## Flow after the change

```text
Staff issues ICA
      |
      +--> linked truck owner?  YES --> email + in-app notice to OWNER only
      |                                  driver: nothing
      |                          NO  --> email + in-app notice to DRIVER (unchanged)
      |
Owner opens ICA, confirms contact info, signs
      |
      +--> contract -> fully_executed
      +--> executed ICA rendered to PDF, stored
      +--> filed into driver's binder: "Lease Agreement (ICA)"
      +--> staff notified: ICA signed
      +--> driver sees the executed ICA read-only in their binder + documents
```

## What each person sees

- **David (truck owner):** one email, "Your ICA is ready to sign", deep-linking to the ICA screen. Confirms his contact fields, signs. Confirmation once executed.
- **Kevin (driver):** no signing prompt anywhere. His ICA tab shows the executed agreement read-only once signed, and the PDF appears in his DOT binder for roadside use.
- **Staff:** the ICA card shows who it was routed to, whether the owner has signed, and the binder slot it landed in — plus a Replace action.

## Technical notes

1. **Single routing decision.** Add a shared helper that resolves the ICA signer for an operator (`truck_owners` row → owner, else driver). The trigger-driven `notify-onboarding-update` path skips the `ica_ready_to_sign` email entirely when a truck owner is linked; `send-notification` stays the single sender in that case and already routes to the owner. `ica_complete` driver copy is suppressed the same way.
2. **Signer resolution fix.** `OperatorICASign` currently checks `operators.user_id` before `truck_owners`. Reverse that precedence: if the operator has a linked truck owner and the viewer is not that owner, render read-only — no signature pad.
3. **Remove acknowledgment.** Drop `DriverICAAcknowledgment` from the driver portal and stop keying completion logic on `ica_driver_acknowledgments`. The table stays for historical records; no new writes.
4. **PDF generation + filing.** New edge function (`file-executed-ica`) invoked after the owner's signature: renders the executed ICA server-side, uploads it to storage, and upserts an `inspection_documents` row for the driver named `Lease Agreement (ICA)`. Idempotent by contract id so re-runs replace rather than duplicate. Failures are logged and surfaced to staff as a retry action, never blocking the signature.
5. **Binder slot rename.** Rename the per-driver slot from `Lease Agreement` to `Lease Agreement (ICA)` in `InspectionBinderTypes.ts`, plus a data migration renaming existing `inspection_documents` rows and the `inspection_binder_order` entry so nothing orphans.
6. **Backfill.** One-time pass for already-executed contracts with a linked truck owner (David/Kevin included) so their binders get the PDF without re-signing.

## Out of scope

- ICA amendments and lease terminations keep their current routing; only the base ICA is covered here.
- No change to the ICA document content or the carrier signature settings.