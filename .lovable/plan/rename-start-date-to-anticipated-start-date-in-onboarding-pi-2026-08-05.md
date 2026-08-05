# Rename "Start Date" to "Anticipated Start Date" in Onboarding Pipeline

## What

Update the Onboarding Pipeline table header and the column picker dropdown so the `start_date` column is labeled **"Anticipated Start Date"** instead of **"Start Date"**. This is a label-only change; no data, sorting, or responsive behavior changes.

## Where

- `src/components/staff/PipelineColumnPicker.tsx` — column configuration label (line 18).
- `src/pages/staff/PipelineDashboard.tsx` — column header `<th>` label (line 3164).

## How

1. Change `label: 'Start Date'` to `label: 'Anticipated Start Date'` in the `PIPELINE_COLUMNS` array.
2. Update the table header text from `Start Date` to `Anticipated Start Date`.
3. Keep the existing `hidden lg:table-cell` responsive class and key name `start_date` unchanged.

## Verification

- Build passes (no functional or type changes expected).
- Open the Onboarding Pipeline and confirm the column picker checkbox shows "Anticipated Start Date" and the table header matches.
