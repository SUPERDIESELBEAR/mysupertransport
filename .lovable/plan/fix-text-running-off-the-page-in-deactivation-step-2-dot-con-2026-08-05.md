# Fix text running off the page in Deactivation Step 2 (DOT Consultant)

## What's wrong
In the DOT Consultant step of the deactivation wizard, several rows put a label on the left and a value on the right with no wrapping rules. When the value is long (driver name, reason text, or an email chip like "Tracey L. McQuilken <tracey@iondot.net>"), the text pushes past the right edge of the panel instead of wrapping or truncating. Narrow/laptop widths make it obvious.

## Fix (presentation only)
In `src/components/management/DeactivationWizardContent.tsx`, step `safety_advisor`:

1. "From Step 1" summary rows (Driver, Unit #, Termination date, Reason)
   - Add `gap-3` to each row, `shrink-0` on the left label, and `min-w-0 text-right break-words` on the value so long values wrap inside the card instead of overflowing.
2. Recipient chips (To and CC)
   - Add `max-w-full`, `min-w-0`, and `break-all` to the chip text span, with the remove "×" button kept `shrink-0`, so a long "Name <email>" chip wraps within the container.
3. Helper text under Email Greeting
   - Add `break-words` so a long typed greeting can't stretch the line past the panel.
4. Apply the same row treatment to the matching summary cards in the Lease Termination and Confirm steps, which use the identical unguarded `flex justify-between` pattern.

No logic, data, or email behavior changes — wrapping/overflow classes only.
