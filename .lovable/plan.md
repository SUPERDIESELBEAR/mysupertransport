

## Fix: Stages Should Only Auto-Collapse When Fully Complete

### Problem
The auto-collapse logic in `OperatorDetailPanel.tsx` (lines 872–881) uses hardcoded conditions that don't match the actual pipeline_config completion criteria. Several stages collapse prematurely before all items are done.

### Mismatches Found

| Stage | Current Auto-Collapse Trigger | Missing Checks |
|-------|-------------------------------|----------------|
| **Stage 1 (BG)** | `mvr_ch_approval === 'approved'` | Missing: `mvr_status` (requested\|received), `ch_status` (requested\|received), `pe_screening_result === 'clear'` |
| **Stage 4 (MO)** | `mo_reg_received === 'yes' \|\| own_registration` | Missing: `mo_docs_submitted === 'submitted'` |
| **Stage 8 (Pay)** | No auto-collapse at all | Should collapse when `pay_setup_submitted === 'true'` |

Stages 2, 3, 5, 6, 7 are correct or stricter than required.

### Fix

Update the auto-collapse block (lines 872–881) in `src/pages/staff/OperatorDetailPanel.tsx`:

**Stage 1**: Add all 4 checks:
```ts
if ((os.mvr_status === 'requested' || os.mvr_status === 'received') &&
    (os.ch_status === 'requested' || os.ch_status === 'received') &&
    os.mvr_ch_approval === 'approved' &&
    os.pe_screening_result === 'clear') autoCollapse.add('stage1');
```

**Stage 4**: Add `mo_docs_submitted` check:
```ts
if ((os.mo_reg_received === 'yes' || os.registration_status === 'own_registration') &&
    os.mo_docs_submitted === 'submitted') autoCollapse.add('stage4');
```

**Stage 8**: Add auto-collapse for Pay Setup (requires checking `contractor_pay_setup` table — the `pay_setup_submitted` field is derived from that table, so we need to check if that data has already been fetched or add a lookup).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Update auto-collapse conditions for Stage 1 (add MVR, CH, PE checks), Stage 4 (add mo_docs_submitted), and Stage 8 (add pay_setup_submitted) |

