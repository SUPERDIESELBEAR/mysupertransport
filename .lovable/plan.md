Replace the ShieldCheck icon in the PipelineDashboard PEI action button with a styled square containing "PEI".

## What
- In `src/pages/staff/PipelineDashboard.tsx`, the PEI action button currently shows only a `ShieldCheck` icon.
- Replace it with a white square (`bg-white`) using the project's gold border (`border-gold`) and gold text (`text-gold`), containing the letters "PEI".

## Exact visual spec
- Container: small square, white fill, 1px gold border (`border-gold`)
- Text: "PEI" centered inside, gold color (`text-gold`), uppercase, semibold, sized to fit neatly within the square
- Placement: same position as the current icon in the action button row on each pipeline card

## Files touched
- `src/pages/staff/PipelineDashboard.tsx` — update the PEI action button markup