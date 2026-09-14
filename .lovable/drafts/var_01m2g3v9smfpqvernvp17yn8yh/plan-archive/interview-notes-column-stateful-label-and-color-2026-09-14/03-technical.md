# Implementation details

## Files to change
1. `src/pages/management/ManagementPortal.tsx`
   - Desktop Interview column button (around line 2111).
   - Mobile Interview notes link (around line 2154).

## Exact UI changes

### Desktop column
Current:
```tsx
<button ... className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors text-left">
  {notesOpen ? <ChevronDown ... /> : <ChevronRight ... />}
  {notes
    ? <span className="truncate">{notes.count} note{...} · {notes.latest}</span>
    : <span>Add note</span>}
</button>
```

New:
- If `notes` is falsy: render **"Add note"** with `text-muted-foreground hover:text-gold`.
- If `notes` exists: render **"See note"** (count === 1) or **"See notes"** (count > 1) with `text-gold hover:text-gold/80`, followed by the count and latest author in muted text.

Example target:
```tsx
{notes ? (
  <span className="flex items-center gap-1.5 text-xs text-left">
    <span className="text-gold font-medium">See note{notes.count !== 1 ? 's' : ''}</span>
    <span className="text-muted-foreground truncate">{notes.count} · {notes.latest}</span>
  </span>
) : (
  <span className="text-muted-foreground">Add note</span>
)}
```

Keep the chevron and `onClick={toggleNotes}` on the button.

### Mobile row
Current:
```tsx
<button ... className="text-[11px] text-muted-foreground underline underline-offset-2">
  {notes ? `${notes.count} note${...}` : 'Add note'}
</button>
```

New:
- No notes → **"Add note"** in muted gray, underlined.
- Notes exist → **"See note(s)"** in gold, optionally with count/author.

## Accessibility
- The button's `aria-label` should reflect the state, e.g.:
  - "Add interview note for {name}"
  - "See {count} interview note(s) for {name}, most recent by {author}"

## Tests
Add or update a test that renders the Applications list with:
1. An application with no notes → expects "Add note" text.
2. An application with notes → expects "See note" or "See notes" text and gold color class.

Use the existing test file for `ManagementPortal` if present; otherwise create `src/pages/management/__tests__/ManagementPortal.applications.test.tsx`.

## Verification
- `npx tsgo --noEmit` passes.
- Vitest suite for the affected component passes.
- Browser spot-check: desktop and mobile widths show the correct label/color for empty and non-empty note states.

## Risks / contradictions
- The staged migration for interview notes must be accepted for real data to appear, but the UI change works against the existing `noteSummary` state regardless.
- No contradictions with existing behavior; this is a pure presentation change.
