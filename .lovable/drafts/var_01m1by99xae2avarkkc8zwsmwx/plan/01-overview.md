# Loosening the device serial conflict rules

You are right — the near-match rule is too broad. Today two devices are flagged whenever their serials are **one character apart**, regardless of which characters. Since vendor serials are issued in sequential blocks, consecutive real devices are almost always one digit apart.

Counted against the live inventory right now (pairs one edit apart, same device type):

| Device type | Pairs flagged | Of those, look-alike characters |
|---|---|---|
| Fuel cards | 364 | 70 |
| ELD | 19 | 4 |
| Dash cam | 14 | 2 |
| BestPass | 6 | 2 |

Fuel cards are the worst offender because their "serials" are 3-digit card numbers (200, 201, 203…) — every card is one digit from a dozen others, so all 364 pairs are false alarms by construction.

The genuine problems the guard exists to catch are two narrow things:

1. **Look-alike characters** — `O` vs `0`, `S` vs `5`, `6` vs `8` (`…100586` vs `…100566` is real). O/I/L/S are already hard-blocked by the folding rule.
2. **A dropped or doubled character** — `AABL36UF80967` vs `AABL36UF380967`. The two serials are different lengths, which is never how sequential numbering works.

A plain digit substitution like `…4269` vs `…4289` inside a sequential block is not evidence of anything.
