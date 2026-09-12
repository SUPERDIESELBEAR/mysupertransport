# Read-only report: heading guard and FleetRoster

No project source, test, database, or documentation file was changed. The three heading mutations were injected only into test reads; `git status --short` remained empty.

## 1. Heading guard mutation proof

All three mutations were made against the covered **Device Models** case or the exception array, one at a time. The original source was used for every run.

### A. Page title changed away from its menu label

Injected change: `title="Device Models"` → `title="ELD Device Models"`.

**Result: failed, 1 failed / 12 passed.** Verbatim assertion:

```text
FAIL  src/test/navigation-title-invariant.test.ts > routed page titles match their menu labels > 'src/pages/management/ManagementPortal…' menu agrees with 'src/components/management/eld/ELDDevi…'
AssertionError: expected 'import { useCallback, useEffect, useM…' to match /title="Device Models"/

- Expected:
/title="Device Models"/
```

### B. Third exception added

Injected exception:

```text
{ menu: 'Test', title: 'Third', reason: 'Mutation proof.' }
```

**Result: failed, 1 failed / 12 passed.** Verbatim assertion and diff:

```text
FAIL  src/test/navigation-title-invariant.test.ts > routed page titles match their menu labels > keeps only the two reasoned owner-approved exceptions
AssertionError: expected [ { menu: 'FAQ', …(2) }, …(2) ] to deeply equal [ ObjectContaining{…}, …(1) ]

+   {
+     "menu": "Test",
+     "reason": "Mutation proof.",
+     "title": "Third",
+   },
```

### C. Page heading removed entirely

Injected change: removed the complete `PageHeading` for Device Models.

**Result: failed, 1 failed / 12 passed.** Verbatim assertion:

```text
FAIL  src/test/navigation-title-invariant.test.ts > routed page titles match their menu labels > 'src/pages/management/ManagementPortal…' menu agrees with 'src/components/management/eld/ELDDevi…'
AssertionError: expected 'import { useCallback, useEffect, useM…' to match /title="Device Models"/

- Expected:
/title="Device Models"/
```

**Verdict:** all three required failure modes are detected. None produced the “does not fail” finding.

## 2. FleetRoster failure

### Verbatim standalone failure

`src/test/nav-target.test.ts` fails standalone. Command result: **1 test file failed; 1 test failed and 2 passed**.

```text
1 navigation destination(s) do not resolve.
EXPECTED RED: this guard shipped on 2026-09-10 with 1 known finding (FleetRoster -> /management/drivers). Do not make it pass by allowlisting it.

src/components/fleet/FleetRoster.tsx:732 sends the user to '/management/drivers' — which does not resolve.
  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => navigate('/management/drivers')}>

Why it fails: /management/* is mounted, but ManagementPortal parses NO path segments — it reads only the query string. '/management/drivers' falls through to the default view.

Nothing throws when this happens. React Router matches the portal wildcard,
the portal finds no view it recognises and renders its default. The user
clicks a button and silently lands somewhere else.
```

### Documentation

It is documented in three durable places:

- `src/test/README.md`:

  > `src/test/nav-target.test.ts` | 1 | `FleetRoster.tsx:617` navigates to `/management/drivers`; Management parses only `?view=`, so the click silently lands on the overview.

  The recorded line number is stale; the same call is now at line 732.

- `docs/tms-build-status.md`, reachability verification:

  > pointing FleetRoster at `/dispatch/nowhere` produced a finding naming the six segments dispatch parses, and pointing it at the correct `/dispatch/loads` took the nav guard to 0 — proving the expected finding is detected, not hardcoded.

- `docs/tms-build-status.md`, later accessorial pass:

  > Its one known finding (FleetRoster -> `/management/drivers`) is untouched and still red.

The test itself also says:

> THIS GUARD IS EXPECTED TO BE RED. It ships with one real finding. Green is reached by fixing the destination — never by allowlisting a finding.

### Origin and verdict

Git history establishes that this project introduced the broken button on **2026-09-03**, in commit `2b16e526…`, as part of the **vacant-units/FleetRoster work** adding the “Assign new driver” action. The navigation guard was added on 2026-09-10 and correctly exposed it.

**Verdict:** this is a real project defect, not external or legacy background noise. “Pre-existing” is accurate only relative to the 2026-09-12 heading pass; it is not grounds for dismissal.

It is documented and continuously visible as an expected-red guard, but **there is no explicit remediation trigger or owner-approved deferral trigger recorded**. The documentation says how it becomes green, and says not to allowlist it, but does not say *when it must be fixed*. That missing trigger is the finding.
