# Fix preview startup crash

## Scope
- Add recovery around the initial dynamically imported application module, which currently rejects without rendering anything.
- Retry transient chunk failures once, reload once for stale Vite chunks, and show a usable retry screen instead of a blank page if recovery is exhausted.
- Reuse the same chunk-error detection and recovery behavior used by lazy portal modules.
- Add focused tests and verify the operator portal still compiles and loads.

## Technical details
- Extract generic dynamic-import recovery into the existing `lazyWithRetry` utility while preserving current lazy-component behavior.
- Update `main.tsx` to catch initial `App.tsx` and roadside entry import failures before they can blank the root.
- Do not change application data, database logic, roles, or portal behavior.
