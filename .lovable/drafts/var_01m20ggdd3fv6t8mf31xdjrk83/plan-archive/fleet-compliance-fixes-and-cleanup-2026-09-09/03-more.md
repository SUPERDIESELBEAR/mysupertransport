## The "Stale" pill — what it means and why it's everywhere

Stale means: **an expiry date is on file, but no document backs it up.** Specifically, either no file was ever uploaded for that item, or the file on record is older than the last time someone typed a new date. It is not saying the driver is out of compliance — it is saying we have a date somebody entered by hand and nothing to prove it.

That is why you see so many: dates have been keyed in over time faster than the paperwork has been uploaded. Once the renewed document is uploaded for an item, its pill clears on its own.

Two fixes here:
- **The tooltip is cut off** because it is being clipped by the scrolling table it sits inside. It will render above the page instead, so the full sentence shows.
- **Reword it** to plainly say what it means, e.g. "No document on file to back up this expiry date — upload the renewal to clear this."

## Other things worth fixing while we're in here

- **DOT alerts silently vanish on error.** If the DOT inspection lookup fails in the alerts panel, the DOT rows just disappear with no message — the sister component already warns about exactly this and shows an error. We'll surface the same error here.
- **Two menu entries, two names.** The same page is listed as "Compliance Tracking" in one menu and "Compliance" in another. Both become "Fleet Compliance".
- **DOT has no sensible destination.** With Open pointing at the document, a DOT inspection alert finally lands somewhere that makes sense instead of borrowing the Med Cert field. The unused "jump to DOT field" wiring gets removed.
- **Fleet cards disappear when you search.** Today a search silently hides all company-wide rows. Once fleet lives on its own tab, search applies within the tab you're on, which is predictable.

## Not included

No change to how alerts are calculated, to the reminder and renew actions, to the 30-day window, or to who can see this page.
