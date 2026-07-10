## What's actually happening

In **Management → FAQ Manager**, each row shows the answer clipped to two lines (`line-clamp-2` at `FaqManager.tsx:512`). The chevron up/down icons on the left of each card are **reorder arrows** (move sort order up/down), not expand toggles. There is no built-in way to view the full answer inline — you have to open the Edit dialog. That's why "expanding" appears to do nothing: the arrows are re-sorting the row.

## Fix

Add a real per-row expand/collapse in the FAQ Manager list.

- Add a small chevron button to the right of the question text (clearly labeled "Show full answer" / "Hide full answer").
- Clicking it toggles that row's answer between clamped preview (`line-clamp-2`) and full text (`whitespace-pre-wrap`, no clamp).
- Track expanded state locally by faq id in a `Set<string>`.
- Reorder arrows keep their current behavior; a tooltip is added to disambiguate them ("Move up in sort order" / "Move down").
- Applies in both audience views (Owner-Operator and Staff toggle) since it's the same list component.

No changes to the driver-facing FAQ (that one already expands correctly). No DB or backend changes.

## Technical section

File: `src/components/management/FaqManager.tsx`
- Add `expanded: Set<string>` state and a `toggleExpanded(id)` helper.
- Wrap `<p className="… line-clamp-2 …">{faq.answer}</p>` (line 512) so that when the id is expanded, drop `line-clamp-2` and render full.
- Add an inline "Show full / Hide" chevron button under the question text or beside it (distinct from action-column icons).
- Add `title` attributes to the reorder arrows to remove ambiguity.
