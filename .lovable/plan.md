# Require Scrolling Through Authorization Documents Before Enabling Checkboxes

## Goal
On the Driver Application Step 8 (Disclosures & Authorizations), an applicant cannot tick an acknowledgment checkbox until they have scrolled to the bottom of the associated disclosure text — proving they had the document in front of them. Today every checkbox is immediately tickable.

## Affected file
`src/components/application/Step8Disclosures.tsx` only. No data-model or backend change; this is a UX gate on the existing booleans.

## Section → checkbox mapping
| Scrollable disclosure box | Checkbox(es) it gates |
|---|---|
| FCRA Authorization (`max-h-36`) | *(no current checkbox — see "FCRA gate" below)* |
| PSP Authorization (`max-h-40`) | `auth_safety_history`, `auth_drug_alcohol`, `auth_previous_employers` |
| Company Testing Policy (`max-h-48`) | `testing_policy_accepted` |

### FCRA gate
The FCRA paragraph currently has no checkbox. To match the user's intent ("Authorization Documents"), the PSP checkboxes will be additionally gated by the FCRA box scroll-completion, because `auth_previous_employers` says *"I have read the above Disclosure…"* and the only Disclosure preceding it is FCRA + PSP combined. So the 3 PSP checkboxes unlock only after **both** FCRA and PSP scroll boxes are read.

## Mechanics
- Add per-box scroll-completion state via `useState<Record<string, boolean>>` keyed by `fcra | psp | testing`.
- A `ScrollableDisclosure` wrapper component renders the existing `bg-secondary` scroll box, attaches an `onScroll` handler, and flips its key to `true` when `scrollTop + clientHeight >= scrollHeight - 4`.
- On mount, the wrapper also checks if the content already fits without scrolling (`scrollHeight <= clientHeight`) and auto-marks it complete — so short viewports or copy-shrinks don't lock users out.
- A `useLayoutEffect` re-runs that check on window resize.
- Add a small footer strip inside each disclosure box:
  - Unread: amber pill, "↓ Scroll to the bottom to continue."
  - Read: green pill with check, "Document reviewed."

## Checkbox behavior
- `CheckItem` gains a `disabled?: boolean` and `disabledHint?: string` prop.
- When disabled:
  - Visual: greyed background (`bg-muted/40`), checkbox input `disabled`, cursor `not-allowed`, label colour `text-muted-foreground`.
  - Below the label, render `disabledHint` in small muted italic text: *"Read the disclosure above to enable this acknowledgment."*
- Wire up:
  - PSP checkboxes → `disabled = !(scrolled.fcra && scrolled.psp)`
  - Testing policy checkbox → `disabled = !scrolled.testing`
- If a checkbox is already `true` (e.g. from `Resume Application`), do not lock it back to disabled — applicants returning to fix one field shouldn't lose their previous acknowledgment.

## Validation interaction
No change to `errors` — the existing required-checkbox validation in Step 9 / submit flow keeps working. The gate is purely about enabling the input.

## Out of scope
- No new fields, no DB column for "read at" timestamps.
- No change to text content of the disclosures.
- No change to the DOT Pre-Employment Questions radio buttons (they are not within a scroll box).
- No changes to Step 9 signature or progress validation.
