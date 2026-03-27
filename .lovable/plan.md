

## Fix: Duplicate Email Error When Adding a Driver

### Problem

When adding a driver whose email already exists in a submitted (non-draft) application, the database unique constraint `applications_email_non_draft_unique` rejects the insert. The raw database error is shown to the user instead of a helpful message.

### Fix — one file: `src/components/drivers/AddDriverModal.tsx`

**Before inserting** into `applications`, query for an existing non-draft application with the same email:

```ts
const { data: existing } = await supabase
  .from('applications')
  .select('id')
  .eq('email', form.email.trim().toLowerCase())
  .eq('is_draft', false)
  .maybeSingle();

if (existing) {
  toast({
    title: 'Email already in use',
    description: 'A driver with this email address already exists. Please use a different email.',
    variant: 'destructive',
  });
  setSaving(false);
  return;
}
```

This goes at the top of the `try` block in `handleSubmit`, before the `applications` insert (line 62). It catches the duplicate early and gives a clear, actionable message instead of the raw constraint error.

### No database changes. No new files.

