# Broadcast Recipients: Select-All-Then-Deselect + CTA Explainer

## Answering your questions first

**What is the CTA button label?**
It's the text shown on the gold action button at the bottom of the email — e.g. `View in Portal`, `Open Onboarding`, `Read the Update`. It's optional. If left blank, no button appears.

**What is a CTA URL?**
It's the link that button opens when an operator taps it — e.g. `https://mysupertransport.lovable.app/dashboard` or a deep link to a specific page. Both fields must be filled in together for the button to render; otherwise the email sends without a CTA.

---

## Recipient selection change

Today the composer has two modes: "All active" or "Selected operators". You want a single combined flow: start with everyone selected, then uncheck the few you want to skip.

### Composer behavior

- Replace the two-button scope toggle with a single **Recipients** card showing:
  - Headline count: `Sending to X of Y active operators`
  - Button: **Manage recipients** (opens the picker)
  - Small helper text: "All active operators are included by default. Open the picker to exclude anyone."
- On first load (new broadcast), every active operator is included automatically.
- The internal model flips from an *include list* to an *exclude list*: we track `excludedIds: Set<string>` instead of `selectedIds`.
- Eligible recipient count = `operators.length - excludedIds.size`.

### Picker dialog

- Title: **Manage recipients** with subtitle `X of Y included`.
- Top action row:
  - **Include all** (clears the exclude set)
  - **Exclude all** (adds every operator to the exclude set — guards against accidental empty sends with a confirm)
  - Search box (existing)
- Each row shows a checkbox that is **checked = included**. Unchecking adds the id to `excludedIds`.
- Footer: `Done (X included)`. Disabled save if 0 included.

### Persistence / API

To stay backward compatible with the existing `operator_broadcasts` table:

- When **everyone** is included → save as `recipient_scope = 'all'`, `selected_operator_ids = null` (unchanged behavior).
- When **some are excluded** → save as `recipient_scope = 'selected'`, `selected_operator_ids = <resolved include list at save time>`.
- The edge function (`send-operator-broadcast`) already handles both shapes, so no function changes are required for sending.

### Loading drafts / scheduled items

- If a loaded broadcast has `recipient_scope = 'all'` → `excludedIds = new Set()`.
- If `recipient_scope = 'selected'` → compute `excludedIds = allOperatorIds - selected_operator_ids` so the UI reflects "all minus a few" rather than "a tiny custom list".
- Edge case: if a selected draft references operators that no longer exist or new operators have joined since, those new operators show as **included by default** (matches the new mental model). A small banner inside the picker notes: `N new operator(s) added since this draft was created — included by default.`

### Validation

- Block send/schedule when included count = 0 with a toast: "Select at least one operator."
- Final preview dialog footer shows: `Will send to X operator(s).`

## Files to change

- `src/components/management/OperatorBroadcast.tsx` — replace scope toggle, rework picker, swap state from `selectedIds` to `excludedIds`, adjust save payload, adjust draft-load mapping.

No database migration, no edge function change.
