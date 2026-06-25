# Fix: Stage 2 "Upload Documents" routes to Notifications

## Diagnosis
- `OnboardingChecklist.tsx:252` correctly calls `onNavigateTo('documents')`.
- `OperatorPortal.tsx:1390` binds `onNavigateTo={(v) => setView(v as OperatorView)}`.
- `view === 'documents'` correctly renders `OperatorDocumentUpload`.

Most plausible cause: a race between two effects in `OperatorPortal`:
1. Reader (124–132) — runs on `location.search` change → `setView(tab)`.
2. Writer (137–148) — runs on `view` change → `navigate({ search }, { replace: true })`.

If the user previously opened the bell (URL = `?tab=notifications`), the stale param can re-fire the reader and overwrite `setView('documents')` back to `'notifications'`.

## Proposed change (one file)
`src/pages/operator/OperatorPortal.tsx` — replace the inline `onNavigateTo` at line 1390 so the URL is pushed synchronously and the writer/reader cannot race:

```tsx
onNavigateTo={(v) => {
  const target = v as OperatorView;
  setView(target);
  const search = target && target !== 'progress' ? `?tab=${target}` : '';
  if (window.location.search !== search) {
    navigate({ pathname: '/operator', search }, { replace: false });
  }
}}
```

Guarantees Stage 2's "Upload Documents" lands on the Documents upload view (Form 2290 / Truck Title / Truck Photos / Truck Inspection) regardless of any stale `?tab=` param.
