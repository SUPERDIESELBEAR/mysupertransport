# Assign Driver dialog: colored eligibility indicators + working scroll

## Fix 1 — Eligibility indicators get color, tooltips, and a legend

Each driver row in the dropdown keeps its symbol but gains meaning:

- Green check — no compliance issues
- Red X — blocking issues (assignment requires management override)
- Amber "!" — warnings only

Hovering (or focusing) an indicator shows a short tooltip in plain language, e.g. "Medical card expired March 3, 2026" or "Currently assigned to ST26004 · CDL expires in 9 days". If a driver has more than three issues, the first three are listed followed by "+2 more".

A single muted helper line sits at the top of the dropdown, under the search box:
`✓ Eligible   ! Warnings   ✕ Blocked`

Eligibility rules, assignment behavior, and the existing blocking/warning panels below the picker are unchanged.

## Fix 2 — The driver list scrolls again

Root cause: the driver picker's popover is rendered from inside a modal Dialog. The Dialog's scroll-lock only allows wheel/touch scrolling inside its own subtree, and the popover is portaled outside it — so the wheel and trackpad do nothing over the list and the scrollbar drag is unreliable.

Fix at the source: mark the popover as modal so it registers its own scroll allowance, so wheel, trackpad, scrollbar drag, and arrow-key navigation (which auto-scrolls the active row into view) all work. Keyboard focus stays in the search input as today.

Broker select (Create Load) and Facility select (load stops) render on plain pages, not inside a Dialog, so they are not affected — they will be verified in the browser and only touched if the same defect shows up.

## Technical detail

- `src/components/shared/DriverCombobox.tsx`
  - `<Popover modal>` so Radix's scroll-lock shard covers the popover content; keep `CommandList`'s `max-h`/`overflow-y-auto` (adds `overscroll-contain`).
  - New optional option fields: `status?: 'eligible' | 'warning' | 'blocked'` and `statusDetail?: string[]`. When present, render the icon (Check / AlertTriangle / XCircle) in `text-success`, `text-warning`, `text-destructive`, wrapped in a `Tooltip` built from `statusDetail` (first 3 + "+N more"), with an `aria-label` carrying the same summary. Render the legend row when any option has a `status`.
  - Callers that don't pass `status` render exactly as today.
- `src/components/dispatch/loadDetail/AssignDriverDialog.tsx`: stop appending `✓ / ! / ✕` to the driver name; map each driver's `DriverEligibility` to `status` + `statusDetail` (issue `message` strings) instead.
- Add `--success` / `--success-foreground` HSL tokens to `src/index.css` (light + dark) and register `success` in `tailwind.config.ts`, matching the existing `warning` token pattern; no hardcoded hex.
- Wrap the dialog content in the existing `TooltipProvider` if one isn't already in scope.

## Verify

Open a load, click Assign Driver, confirm colored icons with tooltips and the legend, scroll the 147-driver list with wheel/trackpad/scrollbar, and arrow-key through it. Then open Create Load and a load stop to confirm broker/facility pickers still scroll.
