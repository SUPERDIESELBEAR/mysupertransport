## Problem

When clicking **Edit** on a saved draft (or a scheduled broadcast), the form fields are populated correctly behind the scenes, but the UI stays on the **Drafts** tab. So nothing visibly happens — the populated composer is hidden on the other tab.

The root cause is in `src/components/management/OperatorBroadcast.tsx`: the `Tabs` component is uncontrolled (`defaultValue="compose"`), so `loadIntoComposer()` has no way to switch the active tab back to **Compose** after loading the draft.

## Fix

In `src/components/management/OperatorBroadcast.tsx`:

1. Convert `Tabs` to a controlled component:
   - Add `const [activeTab, setActiveTab] = useState('compose')`.
   - Change `<Tabs defaultValue="compose">` to `<Tabs value={activeTab} onValueChange={setActiveTab}>`.

2. In `loadIntoComposer(b)` (used by both the Drafts and Scheduled "Edit" buttons), call `setActiveTab('compose')` before/after populating the form so the user is taken straight to the editable composer.

3. In `resetCompose()`, leave the active tab alone (user may want to stay on Drafts after a "Start new"), but ensure the toast still confirms the load.

No backend, schema, or edge function changes are needed. This is a single-file UI fix.
