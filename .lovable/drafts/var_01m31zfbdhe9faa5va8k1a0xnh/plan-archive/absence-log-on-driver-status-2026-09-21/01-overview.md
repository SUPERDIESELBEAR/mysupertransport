# Absence Log on Driver Status

## What you get

A permanent, dated record of every day a driver was not on the road — the reason, who entered it, and when. Entered on the calendar, read back as a time log.

**Answering your questions directly:**

- **The name is "Absence Log"** — it covers truck down, home time, medical, and plain not-dispatched days.
- **Are today's notes current and kept?** No. The Notes box on a driver is a single live field: every edit overwrites the one before it, and nothing is dated. There are 6,039 day entries in the calendar and **not one** carries a note. So there is no history to look back on today.
- **Does the Absence Log replace Notes?** Yes, as you asked. The Notes box on the card, the Notes textarea in edit mode, and the Notes column in the table all come out. Every reason is entered against a date instead, so it is automatically kept.

## How dispatch enters a reason

On the driver's calendar, clicking a day opens the same small popover as now — with a reason picker and a note box added underneath the status buttons:

- Pick the day's status (Dispatched, Home, Truck Down, Not Dispatched) as today.
- If the status is not Dispatched, pick a reason: **Truck Down, Home Time, Vacation, Medical, Personal, Waiting on Load, No Driver, Other**.
- Add a free-text note ("engine rebuild at Peterbilt Kansas City"). Required when the reason is Other.

The existing **Range** tool gets the same two fields, so a full week at home is one entry, applied to every day in the range.

## How it reads back

The **Absence Log** is a chronological list, newest first, grouped into stretches rather than loose days:

```text
Sep 14 – Sep 18, 2026   5 days   Truck Down
   Engine rebuild at Peterbilt Kansas City
   Entered by Leo Wallace, Sep 14

Sep 2 – Sep 3, 2026     2 days   Home Time
   Daughter's graduation
   Entered by Mae Lauron, Sep 2
```

Above the list: a month/quarter/year/all-time picker plus a custom from–to range, and a one-line total ("23 days off the road — 11 truck down, 8 home, 4 other"). Consecutive days with the same reason collapse into one row; a gap or a change of reason starts a new row.

## Where it appears

- **Cards view** — the "History" dropdown directly below the calendar is replaced by the Absence Log dropdown.
- **Table view** — the "History" button under the driver's name and phone opens the Absence Log.

Both open the same panel. The status-change timeline that "History" showed is folded into it: each stretch shows its status, so nothing is lost.
