# Fleet Compliance: fixes and cleanup

## Why "Open" behaves that way today

Confirmed in the code: the Open button sends staff to the **application review drawer** and asks it to jump to a field. That drawer only knows two destinations — CDL, or everything else. So a Med Cert alert lands on the Med Cert date box, and a DOT inspection alert also lands on the Med Cert date box, with the calendar popped open. That is the screenshot you sent. It was never meant to open a date picker at you; it was meant to "take you to the thing", and the only "thing" it knows about is a date field on the application.

## What we'll change

1. **Menu name** — the sidebar item becomes **Fleet Compliance**, matching the page title. (There is a second, shorter "Compliance" entry in another menu list; that one gets the same wording so the two never disagree.)
2. **Open now opens the document.** Clicking Open shows the actual file behind the alert — the license, the medical card, the inspection report — in the same in-app viewer used elsewhere. If no file has ever been uploaded for that item, the button says **Upload** instead and takes you straight to the upload step. No more surprise date pickers.
3. **View the document from the summary rows too.** Every row and card in the Compliance Summary that has a file on record gets a view action next to Upload and History.
4. **Fleet vs. Drivers tabs.** The "Fleet (all drivers)" cards move behind their own tab. A small **Fleet / Drivers** toggle sits at the top of the summary; Drivers is the default, so the driver grid is no longer interrupted by two company-wide cards. The fleet tab shows Insurance, IFTA and any other company-wide items with their same inline date editing.
5. **Date edits stay, and stay in sync.** You keep inline expiry editing here. We verify that saving a date here still writes through to the driver's record everywhere it is shown, and we make the same true for an uploaded renewal — one save, one truth.
