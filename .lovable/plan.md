# Messages section on ST26035 — diagnosis and fix

## Answering your two theories

Neither one is the cause, based on reading the code:

1. **`isStaff` is not excluding you.** In `useAuth`, `isStaff = isManagement || isOnboardingStaff || isDispatcher`, and `isManagement = roles.includes('management') || isOwner`. Owner and management both satisfy `isStaff`. Nothing else needs changing there.
2. **`LoadMessagesCard` never returns null.** It always renders the heading, the Message button, and one of three bodies (loading / empty / list). With no driver, the button is still rendered and warns via toast on click — exactly as described.

So the missing section has a third cause that I have not confirmed yet. Confirmed facts about ST26035 (`0b022130…`): no operator assigned, zero rows in `messages` with that `load_id` — so the expected state is heading + "No messages linked to this load yet".

## Step 1 — Confirm why it is absent (before changing behavior)

Drive the real page in a headless browser with your session, land on the load, and capture:
- whether the "Messages about this load" heading exists in the DOM,
- whether a `SectionErrorBoundary` fallback ("This section could not be displayed") is showing in its place,
- console errors and the network result of the `messages?load_id=eq.…` request.

That distinguishes the three remaining possibilities: a boundary-caught render fault, a stale preview bundle, or the section rendering but visually reading as nothing.

## Step 2 — Make the no-driver state self-explanatory

Regardless of Step 1's result, apply your rule to `LoadMessagesCard`:
- Keep the section heading always.
- When `driverUserId` is null: render the Message button **disabled** and labeled "Message Driver", with body text "No driver assigned to this load yet. Messages already linked to this load stay visible here." The toast-warning path is then unreachable for this case, so it gets removed.
- Keep showing any existing load-linked messages even when no driver is currently assigned, so a reassignment or unassignment never hides history.

## Step 3 — One real gap worth naming

RLS on `messages` limits reads to `sender_id = auth.uid() OR recipient_id = auth.uid()` (plus group threads). So this card only shows load-linked messages **you** were party to — a load with a dispatcher-to-driver conversation will look empty to a different staff member. That is a separate change (a staff-read policy or an RPC scoped to load-linked messages) and I would not fold it into this fix. Say the word and I will plan it next.

## Technical notes

- Files touched: `src/components/dispatch/loadDetail/LoadMessagesCard.tsx` only.
- No schema, RLS, or `useAuth` changes in this plan.
- Verification script lives under `/tmp/browser/`, not in the project.
