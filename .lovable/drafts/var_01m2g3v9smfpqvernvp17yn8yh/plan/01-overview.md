# The unit number list, and why it is empty right now

Two things are going on.

**1. The dropdown already exists.** In the onboarding pipeline the unit number field
is no longer free text — it is a picker that lists, in order:

- Recycled numbers (given to a driver who never reached Go-Live), oldest freed first
- Never-issued gaps in the sequence
- The next number in sequence (272 today)

You can still type a number by hand, and if someone already holds it you get a
named warning saying who and whether they are live or still onboarding. The same
list is also readable from Vehicle Hub under "Unit Numbers".

**2. The message you saw is the list not being switched on yet.** The pool lives
in a database change that is staged with this draft and only takes effect when
you accept the draft. Until then the picker asks for a list that does not exist
and shows the raw technical sentence you pasted.

So nothing is broken — but the message should say that in plain words instead of
showing database wording.
