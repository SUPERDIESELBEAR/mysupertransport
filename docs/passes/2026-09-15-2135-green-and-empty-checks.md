# Pass report — 2026-09-15 21:35 UTC

## Scope

Documentation only. Edit `docs/tms-build-status.md`. No migration, schema change,
test, or application code.

## What was recorded

Two findings from the 2026-09-15 B6 Group 3 pass, both green-and-empty checks.

### 1. The typecheck was checking nothing

`npx tsgo --noEmit` at the repository root compiles ZERO files. Root
`tsconfig.json` has `"files": []` and only project references, so the command
exits clean having examined nothing. Every pass reporting "typecheck clean" from
the bare command reported a vacuous result — all of them, not some. No attempt
was made to identify which passes were affected.

Correct command: `npx tsgo -p tsconfig.app.json --noEmit`.

Rule recorded: a pass reporting a clean typecheck must name the command it ran.

### 2. A "known flake" was hiding real failures

`(EAUTHQUERY) auth_query secret check timed out` was treated across several
passes as a known pooler flake and retried past. Collapsing 93 psql spawns into
two revealed TWO GENUINE ERRORS beneath it:

- `column x.user_id does not exist` (`message_notification_throttle` keys on
  `recipient_id`)
- `operator is not unique: text || "char"` (`confdeltype` needed `::text`)

`psql()` now retries ONLY on that exact connection string and rethrows any
Postgres `ERROR:`.

Recorded as the FIFTH instance of a dismissive label covering something real,
alongside the four "pre-existing" ones. Same pattern: a category meaning
"ignore this" applied to a class rather than an instance.

### 3. The fourth green-and-empty check

Counted together:

1. nav-target guard passed because a 404 catch-all matched every broken link
2. resolver guard read one line of a multi-line function and matched `CREATE`
3. census assertions passed on a snapshot rather than an invariant
4. the typecheck compiled no files

Rule recorded: A CHECK THAT HAS NEVER FAILED HAS NOT BEEN SHOWN TO WORK. The
practice of demonstrating every guard by breaking it deliberately is EXTENDED
to commands: any command whose passing is treated as evidence must be shown to
fail at least once — typecheck, linter, and any future tooling included.

## Verification

- `docs/tms-build-status.md` appended at end of file.
- No file outside `docs/` was modified.

## Contradictions

None.
