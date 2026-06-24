# Make Forms Catalog Preview Interactive (Management → Driver Application)

The Driver Application preview in **Management → Forms Catalog** is wrapped in `pointer-events-none select-none` and uses a `noop` onChange, so the new FMCSA acknowledgment checkbox and employer inputs can't be clicked or typed into. Make the preview interactive so staff can test the gate end-to-end.

## Change

**`src/components/management/FormsCatalog.tsx`** — `PreviewStep` component (lines ~164–179):

1. Convert from read-only to a local-state preview:
   - Lift `SAMPLE_DATA` into a `useState` inside `PreviewStep` (keyed by the active step so navigating Step → Step resets to the seeded sample, preventing cross-step leakage).
   - Pass a real `onChange={(field, value) => setData(prev => ({ ...prev, [field]: value }))}` to each step component.
2. Remove the `pointer-events-none select-none` wrapper so checkboxes, inputs, radios, and buttons are clickable.
3. Keep the existing "Read-only preview · N steps" header copy but change it to **"Interactive preview · changes are not saved"** so staff understand nothing persists.

## Result

- Staff click "Preview" on Driver Application → page to Step 3.
- Amber FMCSA box appears with the **acknowledgment checkbox** — clickable.
- After checking it, employer fieldsets enable and the sticky condensed reminder appears.
- All typing/selecting works; nothing is saved (no `/apply` submit path is exposed in preview).

## Out of scope
- No change to the public `/apply` flow or to validation.
- No change to standalone-document previews (those don't have form inputs).
