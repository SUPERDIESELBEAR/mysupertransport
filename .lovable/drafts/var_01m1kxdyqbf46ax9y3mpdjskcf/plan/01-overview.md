# Two issues: the DOT consultant notice, and the ICA send error

## 1. Tracey did not receive the Edward Williams notice

The send record from 14:41 UTC today shows:

- **To:** marc@mysupertransport.com — only you
- **CC:** empty
- **Greeting:** Marc
- Recorded as a **test send** (consultant not included), which is why the driver's "consultant notified" stamp was deliberately left alone

Removing her address worked exactly as intended. She got nothing.

The green line, and the toast that went with it, are a fixed sentence that always prints the name of the **saved** DOT Consultant on file — never the people the email actually went to. It is a wording defect in the confirmation, not a delivery defect.

## 2. "Trigger functions can only be called as triggers" on Reginald Blue's ICA

This one is a real, reproducible database fault, and it blocks every ICA that is **re-sent from a saved draft** (Reginald's banner reads "Resuming saved draft"). A brand-new ICA that has never been saved is unaffected, because the fault sits on the update path only.

Two guard rules are attached to the ICA contracts table. One of them is a thin wrapper that tries to run the other by calling it like an ordinary function. Postgres forbids that — a guard rule can only be run by the database itself, never called by name — so the save aborts and the ICA never goes out. The wrapper is redundant: the rule it is trying to invoke is already attached to the table and already runs on its own.
