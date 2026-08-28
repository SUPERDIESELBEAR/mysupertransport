# Restamp stale test baselines in README and tms-build-status

Module 11 Pass 1 closed with `gate.ts` restamped to the vitest 3.2.7 shapes, but the two companion documents still carry the old figures. All three must agree.

## Changes

1. **`src/test/README.md`** (lines 28–83) — update the two baseline blocks:
   - With database: `113 passed | 1 skipped (114)` / `874 passed | 7 skipped (881)` → `114 passed | 1 skipped (115)` / `878 passed | 7 skipped (885)`
   - Without database: `106 passed | 8 skipped (114)` / `840 passed | 33 skipped (873)` → `107 passed | 8 skipped (115)` / `844 passed | 33 skipped (877)`
   - Bump the "measured 2026-08-28" note to name the vitest 3.2.7 reinstall as the cause.

2. **`docs/tms-build-status.md`** (lines 63–64) — same two figure updates in the current-baselines section (the historical pass-by-pass entries further down stay untouched).

## Explicitly out of scope (per your instruction)

- No change to the canvas-stub postinstall behavior (diagnosed: installer bypassed the root `postinstall`; the script itself covers all paths when run).
- No pin of vitest — `^3.2.4` stays as committed.
- No code, schema, or test changes. No new work toward Pass 2.
