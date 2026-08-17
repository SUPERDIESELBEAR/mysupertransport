# Clean up the bottom corners of onboarding Stage cards 1–8

## What's causing it

Confirmed in `src/pages/staff/OperatorDetailPanel.tsx`:

- Each Stage 1–8 card is a wrapper `div` with `rounded-xl` and a border, but **no `overflow-hidden`**.
- Inside it, the stage title is a sticky button styled `bg-white rounded-t-xl border-b border-border/70 shadow-sm` — rounded on top only, square on the bottom.
- When a stage is collapsed, that button is the *only* child, so its square white bottom edge and its own drop shadow sit on top of the wrapper's rounded bottom corners. The white square corners overpaint the rounded border, and the button's `border-b` + `shadow-sm` draw an extra hairline just above the card's bottom edge. That is the "unclean" corner circled on Stage 1.
- Stage 9 (line ~7010) uses a plain non-sticky, unrounded, transparent-background header button, so nothing overpaints its corners — which is why it looks clean.

## Repair

1. Add `overflow-hidden` to each Stage 1–8 card wrapper so any child is clipped to the rounded shape.
2. When a stage is collapsed, drop the header button's bottom divider and shadow and round its bottom corners (`rounded-b-xl`, no `border-b`, no `shadow-sm`); keep the divider and shadow only while expanded, where the sticky bar needs to read as separated from the body.
3. Apply the same treatment uniformly across Stages 1–8 (including the PE stage card) so all cards match Stage 9's clean silhouette.

## Notes

- Presentation-only change, confined to the stage card wrapper and header button class strings in `src/pages/staff/OperatorDetailPanel.tsx`.
- No change to sticky positioning behavior, scroll-into-view logic, stage data, or completion rules.

## Verification

Collapse all stages and confirm every card's bottom corners are fully rounded with no white square overhang or stray hairline; expand each stage and confirm the sticky title still pins under the driver bar with its separating border and shadow intact.
