# Interview-notes column: stateful label and color

## What we're changing
On the Applications page, the **Interview** column currently shows:

- No notes → "Add note" in muted gray.
- Notes exist → "{count} note(s) · {author}" in muted gray.

We will make the label and color reflect whether notes exist:

- No notes → **"Add note"** in muted gray (`text-muted-foreground`).
- Notes exist → **"See note"** / **"See notes"** in the brand gold (`text-gold`), with the count and most recent author preserved as secondary text.

This gives staff an immediate visual signal that an application has interview content to review, without relying on color alone.

## Scope
- Only the Applications list in `src/pages/management/ManagementPortal.tsx`.
- Desktop grid column and mobile compact row.
- No database or drawer changes.
- No change to the interview-notes panel itself.

## Out of scope
- Changing the panel content, edit/delete rules, or audit logging.
- Altering the Screening chips.
- Adding new columns or filters.
