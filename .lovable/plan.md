## Enforce "collapsed by default, no persistence" on every management-side expandable section

### Audit results

The management side has ~15 components with collapsible sections. **Almost all already start collapsed and reset on navigation** (plain `useState`, no persistence). The audit found only two exceptions that violate the rule you want:

| Component | Current | Fix |
|---|---|---|
| `DriverHubView.tsx:70` — driver alerts panel | `useState(true)` → expanded by default | Change to `useState(false)` |
| `DriverVaultCard` (staff usage in `OperatorDetailPanel.tsx:~6657` and any other staff caller) | `defaultCollapsed` prop omitted, so it defaults to `false` (expanded) | Explicitly pass `defaultCollapsed={true}` from staff callers |

Everything else already conforms:
- **OperatorDetailPanel** — all 8 stage panels + inspection binder + dispatch history + settlement forecast start collapsed via `new Set(ALL_COLLAPSIBLE_KEYS)`, and re-collapse on operator switch. AI/CH/onboarding-history toggles default `false`.
- **PipelineDashboard** — blocked-operator rows, "Active Open", "On Hold", "Owner Test" sections all default collapsed.
- **ManagementPortal** — install tiles (installed / web-only / never-signed-in) default collapsed.
- **FaqManager** — empty `expandedIds` Set, all answers collapsed.
- **ServiceLibraryManager** — `expandedService = null`.
- **ComplianceDashboard** — per-row `expanded` map empty.
- **EquipmentInventory** — `expandedType = null`.
- **EquipmentAssetSheet** — starts collapsed with "Tap to open".
- **SubmittedApplicationSnapshot** — `expanded = false`.
- **InspectionComplianceSummary** — section `defaultExpanded = false`.

### Areas the same rule applies to (answer to your question)

The screens/sections that have expand/collapse features on the management dashboard:

1. **Onboarding Pipeline → driver detail** — 8 stage panels + Inspection Binder + Dispatch History + Settlement Forecast + AI Insights + Chat History + Onboarding History
2. **Driver Hub** — driver alerts panel *(currently starts expanded — will fix)*, driver vault documents card *(currently starts expanded in staff view — will fix)*
3. **Applications / Pipeline Dashboard** — blocked-operator breakdowns, Active Open Onboarding Items, On Hold, Owner Test Accounts
4. **Management Overview** — PWA install-status tiles (Installed / Web-only / Never signed in)
5. **FAQ Manager** — each FAQ answer card
6. **Service Library Manager** — each service card (single-open accordion)
7. **Fleet Compliance / Compliance Summary** — per-driver document rows (pending vs all operators), the Compliance Summary section itself
8. **Onboard Systems (Equipment Inventory)** — "Show all N devices" per equipment type
9. **Equipment Asset Sheet** — the sheet body
10. **Submitted Application snapshot** (bottom of driver detail) — snapshot panel

Not persisted to storage: I intentionally leave alone `InspectionComplianceSummary`'s view/sort mode, `FleetRoster`'s filter/sort, `ManagementPortal`'s `mgmt_last_view` tab, and `OperatorInspectionBinder`'s one-time "opened" nudge flag — these are user preferences / navigation state, not collapse state.

### Changes

1. **`src/components/drivers/DriverHubView.tsx`** — change `useState(true)` → `useState(false)` for `alertsPanelOpen` so alerts start collapsed.
2. **`src/components/drivers/DriverVaultCard.tsx`** — flip the default prop `defaultCollapsed = false` → `defaultCollapsed = true` so the card body starts collapsed everywhere unless a caller opts in.
3. Sanity-check any remaining callers of `DriverVaultCard` in the staff/operator side to make sure flipping the default doesn't break a screen that intentionally wants it open. If any staff caller was implicitly relying on the old default, no action needed since the rule is "collapsed unless expanded by user"; if the operator-portal side (`OperatorPortal.tsx:1787`) explicitly passes `defaultCollapsed={false}`, that's the operator app (not management) and stays as-is.

Verification: open Driver Hub → alerts start collapsed, driver vault card body collapsed; navigate away and back → still collapsed. Spot-check Onboarding Pipeline driver detail, Overview install tiles, FAQ Manager, Service Library — all remain collapsed on first entry and after navigation.
