# Make Vehicle Hub cards open Vehicle Detail again

Clicking a driver card in Vehicle Hub should open the Vehicle Detail page from anywhere on the card — driver name, unit, empty space, the Repair Cost area, and the DOT status pill. Today only the Repair Cost area reliably works.

What the card looks like now: the outer card `div` does carry a click handler, but taps on text and empty areas are being lost — most likely swallowed by text selection on drag-taps and by nested elements/buttons inside the card, while the plain-text Repair Cost block is one of the few spots that passes the click through cleanly.
