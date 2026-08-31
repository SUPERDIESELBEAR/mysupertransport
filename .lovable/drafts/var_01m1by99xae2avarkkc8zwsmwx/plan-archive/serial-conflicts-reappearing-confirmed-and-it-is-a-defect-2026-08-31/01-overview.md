# Serial conflicts reappearing: confirmed, and it is a defect

Your reviews did happen. What did not happen is anything durable.

Two facts from the data:

- No records were merged. Nothing in the equipment inventory shows a merge in the last several days — the only recent changes are six ELDs marked "lost" and one set back to available. So the 17 pairs were cleared with **"These are different devices"**, not "This one is correct".
- That button writes nothing to the database. It saves the pair key into browser storage only (`localStorage`), under one key on one browser profile, on one origin.

So the pairs come back whenever the storage that held them is not the storage being read: a different computer or phone, a different browser or profile, a private window, cleared browsing data, or — most commonly here — the published app versus the preview link, which are separate origins with separate storage.

This is the right thing to fix rather than re-dismiss. A judgment that two look-alike serials are genuinely two devices is a fleet fact your whole team should share, not a note your browser keeps.

## What changes

- "These are different devices" records the decision in the database, with who decided it and when.
- Any staff member, on any device, sees the pair stay resolved. No one re-reviews the same 17 pairs.
- The panel footer still shows "N pairs marked as different devices — Show", and Undo still works; both now act on the shared record.
- If either serial in a resolved pair is later edited, the pair is re-opened for review — the decision applied to those exact serials, not to the records forever.
