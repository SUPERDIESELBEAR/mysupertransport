# Unit number assignment: pick from what's actually free

Today staff type a unit number into a free-text box on the Truck & Equipment card. Nothing tells them what is taken, what came back when a driver washed out before Go-Live, or what the next number in sequence is. This replaces that box with a picker that answers all three.

## What you asked for, checked against the real records

Your description holds up. The numbers today run in one sequence, the highest in that sequence is **271**, and **12 numbers inside the sequence are sitting unused**: 190, 192, 198, 199, 201, 204, 208, 209, 217, 225, 241, 253. So the "recycled" pool is real and it is not small — the next assignment should be pulling from those before it reaches for 272.

Also confirmed: **9 drivers hold a number with no Go-Live date**. Some of those are still in onboarding (their number stays reserved), and the rest are exactly the wash-out case you described.

## How the picker will work

When staff open the unit number field they get a short list instead of a blank box:

- **Recycled numbers first** — numbers freed by drivers who never reached Go-Live, oldest freed first, each labelled so staff know it is a reuse.
- **Gaps in the sequence** — numbers never issued to anyone.
- **Next in sequence** — 272 today, always offered last.

A number can also still be typed by hand. If the typed number is already held, staff get told who holds it and whether that driver is live or still onboarding — the save is not silently allowed to collide.

## What counts as taken

- Held by an active driver — taken, permanently.
- Held by a driver still in onboarding, no Go-Live yet — **reserved**, not offered.
- Held by a driver who reached Go-Live and later left — taken, not recycled. That number belongs to a truck that ran under the authority.
- Held by a driver removed or archived **before** Go-Live — **released automatically** the moment they are archived, and it appears at the top of the recycled list.

## The numbers outside the sequence

Per your call: 124, 127 and 163 are legitimate and are treated as taken. 000, 1900 and 1901 were test numbers — they are excluded from the sequence math so they can never drag "next number" up to 1902, and they are not offered for reuse either. 185 is disregarded.
