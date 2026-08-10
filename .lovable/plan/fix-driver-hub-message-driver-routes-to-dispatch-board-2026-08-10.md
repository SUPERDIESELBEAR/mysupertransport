# Fix: Driver Hub "Message Driver" routes to Dispatch Board

## Current behavior
In the Management Portal Driver Hub (`/drivers`), clicking the **Message Driver** button on an operator card or in the operator detail panel sends the user to the **Dispatch Board** (`view === 'dispatch'`) instead of opening a message to that driver.

## Root cause
`src/pages/management/ManagementPortal.tsx` wires `DriverHubView` with an `onMessageDriver` callback that ignores the driver `userId` and hard-codes `setView('dispatch')`:

```tsx
<DriverHubView
  ...
  onMessageDriver={() => {
    setView('dispatch');
  }}
/>
```

The same `DriverHubView` and `OperatorDetailPanel` components are used correctly elsewhere:
- `StaffPortal.tsx`: `setMessageInitialUserId(userId); setCurrentView('messages')`
- `DispatchPortal.tsx`: `setMessageInitialUserId(userId); setActivePage('dispatch-messages')`

Management Portal already has a `messages` view and a `messageInitialUserId` state variable, but it is never set before navigation.

## Proposed fix
Update the `onMessageDriver` handler in `ManagementPortal.tsx` to:

1. Accept the `userId` parameter passed by `DriverHubView`/`OperatorDetailPanel`.
2. Store it in `messageInitialUserId` so `MessagesView` pre-selects that driver.
3. Set the view to `'messages'`.

```tsx
<DriverHubView
  ...
  onMessageDriver={userId => {
    setMessageInitialUserId(userId);
    setView('messages');
  }}
/>
```

No other files need to change. `ArchivedDriversView` receives the same prop via `DriverHubView` pass-through, so archived-driver "Message" actions will also be fixed.

## Verification
- Click **Message Driver** from an operator card in Driver Hub → opens Messages view with the driver selected.
- Click **Message Driver** inside the Operator Detail panel from Driver Hub → opens Messages view with the driver selected.
- Ensure no regression in Staff Portal or Dispatch Portal message flows.
