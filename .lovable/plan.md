

The user wants Hazmat and Overweight/Oversize visible in the admin Per-Driver tab as toggleable rows (not entirely hidden). Currently my last implementation filtered them out completely from the admin Company tab and hid them everywhere unless opted in. The user wants the admin to still SEE them in the binder admin so they can toggle them on per driver.

Let me check the current state of InspectionBinderAdmin.tsx to see exactly what was done.
<lov-tool-use id="toolu_vrtx_01MQyc2M4sMi3tVRXrKH5ChA" name="code--search_files" integration-id="code" data="{\"query\": \"filterOptionalDocs|isOptionalCompanyDoc|optionalEnabled\", \"include_patterns\": \"src/components/inspection/*.tsx,src/components/inspection/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01MZmruSY55uZ8ioC8mYyrmt" name="code--search_files" integration-id="code" data="{\"query\": \"filterOptionalDocs|isOptionalCompanyDoc|OPTIONAL_COMPANY_DOCS|optionalEnabled\", \"include_patterns\": \"src/**/*.ts,src/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Gk2KKF9Uekzvx3U5LbSw3P" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/inspection/InspectionBinderTypes.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01CEMgbmJXzN4erxUbhr2zwf" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/inspection/InspectionBinderAdmin.tsx\", \"lines\": \"1400-1470\"}">
</lov-tool-use>
Let me find where the Company tab renders the docs list, to understand where the optional docs are currently being filtered out (hidden).
<lov-tool-use id="toolu_vrtx_01GwQjQW7uxcxqMq1xEcrz95" name="code--search_files" integration-id="code" data="{\"query\": \"visibleCompanyOrder|companyOrder.map|activeTab === 'company'\", \"include_patterns\": \"src/components/inspection/InspectionBinderAdmin.tsx\"}">
</lov-tool-use>
Now I have full understanding. The user wants the optional docs to remain **visible/listed in the Company tab** (currently they're filtered out everywhere) but with a per-driver toggle to show/hide them in that driver's binder.

Actually, re-reading the request: *"keep these two listed and just create a toggle to hide from binder"*. So the user wants to see Hazmat and Overweight/Oversize listed in the **admin Company tab** (so staff can manage them company-wide), and have a toggle that controls whether each driver's binder shows them.

The current implementation filters them out of the Company tab entirely. Let me also check the operator binder and compliance summary.
<lov-tool-use id="toolu_vrtx_017jMnKoREqkSH8fmDCxScX3" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/components/inspection/InspectionComplianceSummary.tsx,src/components/inspection/ComplianceAlertsPanel.tsx,src/pages/InspectionSharePage.tsx\", \"query\": \"filterOptionalDocs|isOptionalCompanyDoc|COMPANY_WIDE_DOCS\"}">
</lov-tool-use>
<lov-plan>

## Show Hazmat & Overweight/Oversize in Admin — Toggle Controls Binder Visibility

### Current behavior (issue)
After the last change, the two optional docs were hidden from **everywhere**, including the admin Company tab. The user wants them visible to staff for management, with a per-driver toggle that controls whether they appear in **that driver's binder** (operator portal, flipbook, compliance, share page).

### New behavior

**Admin Company tab (`InspectionBinderAdmin.tsx`)**
- Hazmat and Overweight/Oversize Permits **always listed** (with all the other company docs)
- Each row gets an "Optional" badge so staff know they're opt-in by default
- Drag-and-drop reorder still works for them

**Per-Driver tab (existing UI stays)**
- "Optional Add-ons" section with the two checkboxes — unchanged from current implementation
- Toggle controls whether the doc appears in the **driver's** binder views

**Driver-facing surfaces (binder, flipbook, compliance, share page)**
- Behavior unchanged from now: hidden by default, only shown for drivers who've been opted in

### Files to change

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | Render the Company tab using `companyOrder` (full list) instead of `visibleCompanyOrder`. Add an "Optional" badge next to Hazmat & Overweight rows. Keep `visibleCompanyOrder` for the **flipbook page builder** so staff flipbook still respects the per-driver opt-in. |
| `src/hooks/useBinderOrder.ts` | Stop stripping optional docs from the saved order — include them in the default company order so they appear in the admin Company tab. (Driver-facing components already filter via `filterOptionalDocs` so they stay hidden by default for non-opted-in drivers.) |

### Why this is safe
- Driver-facing filtering via `filterOptionalDocs` is unchanged → drivers still don't see Hazmat/Oversize unless opted in
- Admin gets full visibility back — they can upload/manage the company-wide files for opted-in drivers' use
- Per-driver toggle continues to work exactly as built
- No DB changes, no data migration

### Out of scope
- Changing the per-driver toggle UI (already in place)
- Adding a separate "company-wide toggle" to globally enable/disable optional docs (not requested)

