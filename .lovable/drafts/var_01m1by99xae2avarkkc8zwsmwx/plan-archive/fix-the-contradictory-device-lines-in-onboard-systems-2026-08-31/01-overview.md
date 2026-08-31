# Fix the contradictory device lines in Onboard Systems

Two separate things produce the confusing card for Jamian Anderson's and Tyler Walls' devices, and neither is computed from the other.

1. **"Was not returned by the operator." is a typed note**, not a status. Five ELDs literally have that sentence stored in the notes field — wording copied from the Return modal's "Not Returned" option. The red "Not Returned" badge already says the same thing, so the note only restates it.
2. **The date labelled "returned" is not a return date.** Verified in the data: not a single assignment row on these devices has a `return_condition` value. The date shown is simply when the assignment row was closed (unassigned) — so a device can read "Not Returned · returned Jul 9".

Plus the note correction you gave: the note reading "Justin Herr" is stored on ELD `AABL36UF013511`, which is Christopher Hickman's device. Justin Herr's actual device is `AABL36UG024841` (confirmed — his assignment row points at it).
