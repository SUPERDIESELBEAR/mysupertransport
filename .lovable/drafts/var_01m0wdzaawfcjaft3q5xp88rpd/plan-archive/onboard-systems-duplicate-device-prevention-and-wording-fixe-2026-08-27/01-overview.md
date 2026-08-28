# Onboard Systems — duplicate device prevention and wording fixes

## What is actually happening

The devices are not double-assigned. The database already prevents two open assignments on one device. What happened instead is that **one physical device was entered twice under two slightly different serials**, so it looks like two devices and each got its own driver.

Confirmed in the live data:

| Device | Driver A | Driver B | Difference |
|---|---|---|---|
| ELD | James Onan — `AABL36UG024945` | Robert Sargent — `AABL36UGO24945` | letter **O** vs zero |
| ELD | Skyler Herring — `AABL36UF80967` | John Chrestman — `AABL36UF380967` | missing a **3** |
| Dash cam | Johnathan McMillan — `ABED32KG018536` | Vino Huddleston — `ABED32KGO18536` | letter **O** vs zero (not previously reported) |

The uniqueness rule in the database strips dashes, spaces and dots and uppercases the serial — but it treats `O` and `0` as different characters, so the near-twin is accepted as a brand-new device.

## Recommendation on strictness

Block confusable characters, warn on near-matches. Reasoning:

- Both vendor formats here are **letter prefix + digits only** (`AABL36U` + digits, `ABED32KG` + digits). In the digit portion, `O` can only ever be a mistyped zero, and `I`/`l` can only be a `1`. Blocking is safe — there is no legitimate serial it would reject.
- The missing-`3` case cannot be caught by character folding, so it needs a second, softer net: when a new serial is within one character of an existing one, show a warning naming the existing device and its holder, with "Use existing device" and "This is a different device, continue" as the two ways forward. A hard block there would be wrong, since real serials can legitimately be one digit apart.

## The plan

### 1. Confusable-character folding (hard block)

Serial comparison gains a canonical form: uppercase, strip dashes/spaces/dots, then fold `O`→`0`, `I`→`1`, `L`→`1`, `S`→`5`. Applied to the database uniqueness rule and to the assign/add forms, so the second entry is rejected with the message naming the existing device and who holds it. The serial the staff typed is still stored as typed — only the comparison is folded.

### 2. Near-match warning (soft)

On the add and assign forms, once a serial is entered, it is compared against existing serials of the same device type. A one-character difference (insertion, deletion or substitution) raises an inline amber warning: "Very close to `AABL36UF380967`, assigned to John Chrestman. Same device?" Staff can proceed deliberately.

### 3. Conflict review, not auto-merge

Nothing is merged automatically. A "Serial conflicts" panel appears at the top of the Onboard Systems inventory listing each confusable pair with both serials, both holders, and assignment dates. Each conflict offers Merge (pick the surviving serial, move history, release the loser's assignment) or Dismiss as a genuine pair. The three known conflicts appear there on first load.

### 4. Wording: Lost/Missing becomes Not Returned

Every driver- and staff-facing label changes from "Lost", "Lost / Not Returned" and "Lost/Missing" to **Not Returned**. The stored status value stays `lost` so history and audit records keep working — this is a display change only.

### 5. Last holder on Not Returned devices

Devices in Not Returned status show the last operator they were assigned to. This already renders in the inventory card and table rows; the plan extends it to the status filter view, the Not Returned section header, the history modal, and the return receipt so the name follows the device everywhere it appears.
