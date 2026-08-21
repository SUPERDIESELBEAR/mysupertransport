# Make conditional test skips deterministic and visible

Today three test files decide whether to run based on incidental environment state, and two of them vanish from the totals entirely when they don't. The goal is that the report always distinguishes "ran and passed" from "did not run, and here is why" — and that a stale build can never produce a false pass.

## 1. A shared gating helper

New file `src/test/helpers/gate.ts` exporting `gatedDescribe(name, { enabled, reason, required })`:

- When `enabled` — behaves as a normal `describe`.
- When not enabled and `required` is false — prints the boxed banner (same style as the `certify_rods_day` skip) naming the file and the exact reason, and registers the suite with a single explicitly named skipped test: `SKIPPED — <reason>`. That makes the non-execution a counted line in the totals rather than an absence.
- When not enabled and `required` is true — registers a suite with one **failing** test stating the gate should have been satisfiable in this environment. This is the CI arm.

`required` is derived from `process.env.CI` being set, so CI never silently skips.

## 2. Bundle tests: explicit signal plus a freshness check

`src/lib/eld/offline/__tests__/roadsideBundle.test.ts` currently runs whenever `dist/assets` merely exists. Replace that with:

- **Explicit opt-in.** The suite runs only when `RUN_BUNDLE_TESTS=1` or `CI` is set. A stray local `dist/` no longer changes the outcome.
- **Freshness gate.** When opted in, compare the newest mtime across `src/**`, `index.html`, `vite.config.ts`, `package.json` and `tailwind.config.ts` against the oldest emitted chunk in `dist/assets`. If any source is newer than the build, the build is stale.
  - In CI (`required`): fail loudly — "dist/ is older than source; build before testing."
  - Locally: skip with a banner saying the build is stale, never assert against it.
- **Missing build.** Same split: fail in CI, skip with a banner locally.

Skipping is the honest outcome; asserting against a build of unknown age is not, so freshness is checked before any chunk is read.

## 3. Make the DB-gated files visible

`src/test/share-token-throttle.test.ts` and `src/test/purge-path-coverage.test.ts` both use `const describeLive = HAS_DB ? describe : describe.skip`, which contributes nothing to the totals. Convert both to `gatedDescribe` with `enabled: Boolean(process.env.PGHOST)` and their existing reasons, keeping the current banners' wording. They will now show a named skipped entry in every run. Their read-only, do-not-write-to-production constraints are unchanged.

`src/test/rods-live-certification.test.ts` keeps its two banners; its outer `describe.skip` gets the same treatment so the no-PGHOST case is counted, and the inner `itExecuting` arm is left exactly as-is (it already registers a named skipped test).

## Result

- Local `vitest run`: a stable, self-describing set of skips — no PGHOST (3 entries), bundle tests not opted in (1 entry) — each with a banner. The count stops oscillating with whether `dist/` happens to exist.
- CI: PGHOST and a fresh build are both present, everything runs, and any gate that cannot be satisfied fails instead of skipping.

## Technical notes

- No change to `vitest.config.ts` or the npm scripts; the CI build step already runs before tests.
- The freshness walk ignores `node_modules`, `dist` and dot-directories, and is cheap enough to run once at module scope.
- Existing assertions in all four files are untouched — only their gating changes.
