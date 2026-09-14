## Alternatives considered

- **Its own sidebar page** — rejected. Reference data used a few times a week does not earn top-level navigation, and it duplicates Vehicle Hub's purpose.
- **Inside the onboarding pipeline only** — rejected. The pool is also useful when Vehicle Hub shows a truck coming off the roster, and management should be able to see it without opening a driver.
- **A settings screen** — the sequence bounds and excluded test numbers do belong in a settings-style form eventually, but that is configuration, not the pool. It can sit behind a small "Sequence settings" link in the same panel, management-only.

## Technical notes

- New `src/components/fleet/UnitNumberPoolPanel.tsx`: a Sheet (mobile) / Dialog (desktop) reading `fetchUnitNumberPool()` and `fetchUnitHolders()` from the existing `src/lib/unitNumberPool.ts`. No new data layer, no new RPC — the same two functions the picker already uses.
- Trigger button added to the Vehicle Hub header in `src/components/fleet/FleetRoster.tsx`, so it appears in both `StaffPortal.tsx` and `ManagementPortal.tsx` without touching either portal.
- Grouping and labels reuse `sortPool`, `KIND_GROUP_LABEL`, `formatPoolOption`, and `holderWarning` — one set of rules, already covered by tests.
- Visibility follows the existing RPC role checks: onboarding staff, management, owner. Operators never see it.
- Read-only. No assignment from this panel, so no writes, no audit changes.
- Tests: a component test that the three groups render in order and the holder lookup renders the existing warning sentence.
- Note: the pool functions only return data once the current draft is accepted, so this panel can only be exercised live after that.
