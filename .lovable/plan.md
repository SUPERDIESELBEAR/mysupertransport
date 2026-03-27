

## Handle Onboarding Stages for Pre-existing Operators

### Current Problem

When a pre-existing operator is added, only `insurance_added_date` is set (which triggers `fully_onboarded = true`). All other stage fields remain at their defaults (`not_started`, `pending`, `no`, etc.). If anyone opens that operator's detail panel, all 8 stages appear incomplete — even though the operator is already working.

### Recommendation

Pre-existing operators should have **all 8 stages marked complete** automatically at creation time. These operators have already gone through everything in real life, so their records should reflect that. This avoids confusion for staff reviewing the detail panel and keeps compliance dashboards accurate.

### Technical Detail

**One file: `supabase/functions/invite-operator/index.ts`**

In the `skip_invite` block (~line 172), expand the `onboarding_status` insert to set all stage fields to their "complete" values:

- **Stage 1 (BG):** `mvr_status: 'received'`, `ch_status: 'received'`, `mvr_ch_approval: 'approved'`, `pe_screening: 'complete'`, `pe_screening_result: 'clear'`
- **Stage 2 (Docs):** `form_2290: 'received'`, `truck_title: 'received'`, `truck_photos: 'received'`, `truck_inspection: 'received'`
- **Stage 3 (ICA):** `ica_status: 'complete'`
- **Stage 4 (MO):** `mo_docs_submitted: 'submitted'`, `mo_reg_received: 'yes'`
- **Stage 5 (Equip):** `decal_applied: 'yes'`, `eld_installed: 'yes'`, `fuel_card_issued: 'yes'`
- **Stage 6 (Ins):** `insurance_added_date` (already set)
- **Stage 7 (Live):** `go_live_date` set to today
- **Stage 8 (Pay):** handled separately via `contractor_pay_setup` table — not set here (staff can fill in later if needed)

This is a single change to the edge function's insert payload. No new tables, no UI changes, no migrations needed.

