# Selected unit number as the gold focus

This makes sense. Gold should identify the number staff are actively evaluating, not remain permanently attached to the next number in sequence.

## Proposed behavior

- When the panel opens, **Next available** remains the gold focus because nothing else is selected.
- Clicking any recycled, gap, or next number makes that number the gold focus.
- Looking up a number makes the lookup number the gold focus once the result returns, whether it is held or free.
- The focused banner changes its label and supporting status: selected pool type, free lookup, or holder warning.
- **Next available** stays visible as a quieter reference when another number is focused, so staff never lose the recommended number.
- Copy remains available from the focused banner and from pool entries.
- Closing and reopening the panel resets the focus to the current next available number.

This preserves the panel as read-only; no unit number is assigned or reserved here.
