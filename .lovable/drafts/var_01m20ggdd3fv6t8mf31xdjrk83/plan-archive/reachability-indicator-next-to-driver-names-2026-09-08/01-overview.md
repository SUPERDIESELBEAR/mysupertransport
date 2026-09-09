# Reachability indicator next to driver names

The "Who can receive messages" card answers the question in the settings panel, but not at a glance where you actually pick who to write to. This plan puts a small reachability indicator directly beside each driver's name.

## What you'll see

### 1. In the Messages list

Every driver row gets a tiny indicator on the corner of their avatar (same spot as the unread count):

- **Green check** — can receive messages in the app right now
- **Amber warning triangle** — cannot be reached; hovering or tapping shows the reason: "No login account", "Application denied", "Inactive", or "Account disabled"

People who are not reachable are exactly the same people, for the same reasons, as the list in the settings panel — one shared rule, so the two views can never disagree.

### 2. In New message and New group chat

The same amber triangle appears on candidates you pick to start a conversation with, so you are warned *before* composing instead of after sending.

### 3. In Bulk Message

Each recipient row gets the same indicator. Reachable drivers show nothing (green is the norm there); anyone not reachable shows the triangle plus a short reason, and a line at the top of the recipient step reads "3 of 46 selected drivers cannot receive messages" so a blast with unreachable people is never silent.

## Design

Small, quiet, and consistent: the green check never shouts (it's the expected state), the amber triangle is the one thing that draws the eye. No extra clicks needed — the reason is a tooltip on hover and a tap on mobile.
