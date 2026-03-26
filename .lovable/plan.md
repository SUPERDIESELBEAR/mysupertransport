
## Current State of Receipt Reminders

Here is what is **already in place** today:

**On the home screen (OperatorStatusPage):**
- The gold QPassport banner (shown when `pe_screening === 'scheduled'` and `qpassport_url` is set) includes the line: *"After your appointment, upload your receipt in the Stage 1 card below."*

**Inside the Stage 1 checklist (PEScreeningTimeline):**
- Step 3 "Receipt Submitted" shows an active "Upload Receipt" button when the screening is scheduled and no receipt has been uploaded yet
- The sublabel says: *"After your appointment, upload the receipt you received from the facility."*
- Once uploaded, a green confirmation banner appears: *"Your coordinator has been notified and will process your screening results."*

---

## The Gap

The QPassport banner is only shown while `pe_screening === 'scheduled'`. Once the coordinator marks the screening as `results_in` or `complete`, that banner disappears. However, if the operator goes to their appointment and comes back — but before results are entered — there is no dedicated home-screen prompt specifically asking them to upload the receipt. The only reminder is buried inside the Stage 1 card.

Additionally, if the operator closes the QPassport banner area without noticing the receipt instruction, they may not know to go back and upload it.

---

## What to Add

**A dedicated "Upload Your Receipt" home-screen banner** that is separate from the QPassport banner, targeting the post-appointment window:

- **Trigger:** `pe_screening === 'scheduled'` AND `qpassport_url` is set AND **no `pe_receipt` doc exists yet**
- **Position:** Shown directly below the QPassport banner (or replacing it if QPassport has already been acted on)
- **Color:** Blue/info tone to distinguish it from the gold QPassport banner — visually it reads as "next step after the QPassport"
- **Content:**
  - Headline: *"Don't forget to upload your receipt"*
  - Body: *"After your drug screening appointment, take a photo of your receipt and upload it here. Your coordinator needs it to process your results."*
  - CTA button: "Upload Receipt" → clicking it scrolls/navigates to Stage 1 where the upload input lives (using `onNavigateTo('checklist')` or a scroll anchor)
- **Dismisses automatically** once `receiptDoc` is present (same as the QPassport banner disappears on status change)

**File to change:** `src/components/operator/OperatorStatusPage.tsx` only.

The condition logic will be:

```text
showReceiptReminderBanner =
  peScreening === 'scheduled'
  && qpassportUrl present          ← they've already received & (likely) used the QPassport
  && no pe_receipt doc uploaded yet
```

This complements the existing in-timeline upload button — it just surfaces it prominently on the home screen so operators don't miss it after returning from their appointment.

No database changes, no new components, no edge functions needed.
