# Fix: driver Messages back button snaps back into the open conversation

## What happens today

On a phone, opening a direct message and tapping the back arrow does clear the conversation for a moment — then a spinner flashes and the same conversation re-opens instead of the inbox list.

Two things in the code cause it, both confirmed by reading the driver messaging components:

1. **The conversation gets re-selected automatically.** When the driver taps a staff member in the Contacts tab, the hub stores that person in `pendingChatUserId` and never clears it. The messages view has an effect that re-selects whoever is in that prop whenever it runs, so pressing back immediately re-opens the same thread.
2. **A reload is triggered by pressing back.** The thread-summary loader is rebuilt whenever the selected conversation changes, which re-runs the whole message fetch. That refetch is the brief "thinking" spinner in the screenshot, and its auto-select step can re-open a conversation as well.

## The fix

- Clear the pending contact once the conversation has opened, so back has nothing to re-select. The hub passes a callback that resets `pendingChatUserId`, and the messages view calls it after applying the deep link.
- Stop the thread loader from depending on the selected conversation, so tapping back no longer refetches the inbox and no spinner appears.
- Make auto-select run only once per load, and never at mobile widths. Back on a phone leaves the list showing; desktop keeps its current two-pane behavior.
- Apply the same handling to group threads so their back arrow behaves identically.

## Technical notes

Files: `src/components/operator/OperatorMessagesHub.tsx`, `src/components/operator/OperatorMessagesView.tsx`.

- Add an `onInitialUserConsumed` prop; the hub sets `pendingChatUserId` to `undefined` when it fires.
- Remove `selectedUserId` from the `buildThreads` dependency list and move the auto-select decision out of the loader into a one-shot ref-guarded effect keyed on first successful load.
- Keep the realtime unread-bump behavior, reading the current selection through a ref instead of a dependency.

## Verification

Simulate a phone-width driver session: open a direct message, tap back, and confirm the inbox list renders with no spinner and the conversation does not reopen. Repeat for a group thread and for arriving via the Contacts tab.