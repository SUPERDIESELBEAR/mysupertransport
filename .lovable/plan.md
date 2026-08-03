# Fix the remaining driver Messages back-button bounce

## Confirmed current behavior in code

- The mobile back arrow only clears `selectedUserId` or `selectedGroupId`.
- The thread-summary loader still contains a separate automatic `setSelectedUserId(...)` path after an asynchronous fetch completes.
- Deep-linked contacts are selected by another effect, so selection is currently controlled from multiple independent paths rather than by one navigation rule.

This leaves the inbox vulnerable to being replaced by a conversation again after the driver has explicitly pressed Back.

## Plan

1. **Make the mobile inbox state authoritative**
   - Add a dedicated back handler that clears both direct and group selection.
   - Record that the driver explicitly requested the inbox, so pending async work cannot select a thread afterward.

2. **Separate loading from conversation selection**
   - Remove automatic selection from the asynchronous thread-building function.
   - Keep desktop's initial two-pane selection in a separate guarded effect that runs only for desktop layout and only when the user has not requested the inbox.

3. **Consume contact/deep-link selection exactly once**
   - Track the last consumed contact ID so parent rerenders cannot apply the same selection again.
   - Keep the parent clear callback stable and reset the inbox guard only when a genuinely new contact is intentionally opened.

4. **Apply the same rule to direct and group chats**
   - Route both thread back arrows through the shared inbox handler.
   - Ensure selecting a new direct or group conversation intentionally exits inbox mode.

## Technical scope

- `src/components/operator/OperatorMessagesView.tsx`
- `src/components/operator/OperatorMessagesHub.tsx`
- No database or messaging-delivery changes.

## Verification

- At phone width, open an existing direct chat, press its back arrow, wait for all requests to settle, and confirm the conversation list remains visible with no reopened thread.
- Repeat for a group chat and a chat opened from Contacts.
- Confirm a newly selected conversation still opens normally after returning to the inbox.
- Confirm desktop retains its two-pane default selection without overriding an intentional mobile back action.