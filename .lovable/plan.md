

## Fix: Operators Cannot Insert Their Own Document Records (RLS Missing)

### Problem
When operators upload documents (PE receipts, decal photos, etc.), the **file** is stored successfully in storage, but the **database record** in `operator_documents` is never created because there is no RLS INSERT policy for operators on that table. Only staff have write access.

The notification fires because it's in a separate try-catch after the failed insert, so staff receive "PE Receipt Uploaded" alerts but see no document when they open the operator's detail panel.

### Root Cause
The `operator_documents` table has these RLS policies:
- **Staff can manage** — ALL (covers insert/update/delete/select)
- **Operators can view their own** — SELECT only

Missing: **Operators can insert their own documents** — INSERT

### Fix

**Database migration** — Add an INSERT policy for operators:
```sql
CREATE POLICY "Operators can insert their own documents"
  ON public.operator_documents
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators
      WHERE operators.id = operator_documents.operator_id
        AND operators.user_id = auth.uid()
    )
  );
```

### Additional improvement
The upload code in `PEScreeningTimeline.tsx` and `OperatorDocumentUpload.tsx` does not check for insert errors before firing the notification. The notification call should be moved **after** confirming the insert succeeded. This ensures staff only get notified when the document is actually saved.

### Files changed

| File | Change |
|------|--------|
| Database migration | Add INSERT policy on `operator_documents` for operators |
| `src/components/operator/PEScreeningTimeline.tsx` | Check insert result before firing notification |
| `src/components/operator/OperatorDocumentUpload.tsx` | Same — check insert result before firing notification |

### After the fix
Operators will need to re-upload their PE receipts (or any documents that failed). The files may exist in storage but have no database records pointing to them.

