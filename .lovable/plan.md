# Broker edit pencil: diagnosis

Reproduced signed in as owner (Marcus Mueller) against the running app: Management portal > Loads > Create Load, opened the Broker picker, selected BlueGrace Logistics.

## 1. Is the button rendering?

Yes. After selecting BlueGrace Logistics, `[data-testid="broker-edit"]` is present in the DOM, `display: flex`, 36x36 px, on-screen at x 900-936 / y 579-615 — immediately right of the Broker combobox, not behind it. `button[title]` enumeration includes "Edit broker details". The screenshot shows a bare, low-contrast pencil glyph sitting in the gap between the Broker field and the "Broker's Load #" field.

So this is not a rendering or gating bug. It is a discoverability problem: a ghost icon button with no label, no border, and muted foreground, placed in whitespace between two labelled inputs, reads as decoration rather than an action. It also only exists after a broker is committed to `broker_id` — if the field shows a parser-extracted name that is not yet linked to a record, there is deliberately no pencil, which is another way it can look "missing".

## 2. Role gate for this session

Passes. `useAuth` derives `isOwner = roles.includes('owner')` and `isManagement = roles.includes('management') || isOwner`. An owner therefore satisfies `isManagement || isDispatcher || isOnboardingStaff` through `isManagement`. Verified against the hook, and confirmed live — the button rendered for this owner session.

## 3. Selected broker object

Resolves correctly. `useBrokers()` returns the full `Broker` records and the `find(b => b.id === value)` lookup produced an object — the trigger label renders "BlueGrace Logistics" from `selected.company_name`, which is only possible when `selected` is non-null. The same `selected` truthiness drives the pencil, so the object is there.

## 4. Do the tests cover this path?

They do exercise the real component: `BrokerSelect.test.tsx` renders the actual `BrokerSelect` and asserts on `broker-edit` for a dispatcher, for no selection, and for a non-writing role. `BrokerDialog` and `useBrokers` are mocked, which is the normal seam here. Since the live DOM check agrees with the tests (button present as owner), the tests were not passing against something other than the rendered component — the tests and the app both say the button exists. The gap is between "in the DOM" and "noticeable to a person", which no assertion on presence can catch.

## Proposed fix (visibility only, pending approval)

- Replace the bare ghost icon with a labelled, bordered affordance next to the picker: small outline button, pencil + "Edit" text, so it reads as an action at a glance. Same for the facility pencil on stops, which has the identical treatment and the same problem.
- Keep it inline with the field (not inside the dropdown) as originally specified, and keep the role gate and `type="button"` behaviour unchanged.
- When the Broker field holds a parser-extracted name with no linked record, keep the existing "not linked to a broker record yet" hint as the only affordance — nothing to edit yet.

No schema, RLS, or business-logic change. Files: `BrokerSelect.tsx`, `StopsSection.tsx`; existing tests keep passing since the test id stays.
