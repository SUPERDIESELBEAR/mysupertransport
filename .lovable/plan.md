# Reorder Stage 6 — Pre-Employment Screening to match the real workflow

## Goal
Present the Stage 6 fields in the order they actually happen during onboarding, instead of the current grouping where the QPassport upload sits below both date fields and the results document sits at the bottom.

## New order
1. PE Screening (status dropdown) — unchanged, stays first
2. PE Scheduled Date
3. QPassport PDF upload
4. PE Results Date
5. PE Screening Result
6. PE Results Document upload (Results Documents subsection)
7. PE Receipt (from operator), when present — stays at the end of the block

## What changes
In `src/pages/staff/OperatorDetailPanel.tsx`, Stage 6 block:
- Move the `QPassportUploader` block so it renders directly after the "PE Scheduled Date" picker and before the "PE Results Date" picker.
- Keep the existing visibility conditions exactly as they are (scheduled/results_in for scheduled date + QPassport, results_in for results date).
- Move the "PE Screening Result" select so it sits between PE Results Date and the Results Documents subsection (it already does in DOM order once QPassport moves; the block just gets pulled inside the flow so spacing stays consistent).
- Move the "PE Receipt (from operator)" viewer below the Results Documents block so the operator-supplied receipt doesn't interrupt the staff sequence.

No logic, data, upload handlers, or status-advance behavior changes — this is markup ordering and spacing only.
