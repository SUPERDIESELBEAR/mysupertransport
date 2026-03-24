
## Plan: Start Desktop Sidebar Expanded by Default

**Single change required** — line 64 in `src/components/layouts/StaffLayout.tsx`.

### What changes

Change the initial `sidebarOpen` state from `false` to `true`:

```ts
// Before
const [sidebarOpen, setSidebarOpen] = useState(false);

// After
const [sidebarOpen, setSidebarOpen] = useState(true);
```

This is the only change needed. The desktop sidebar is already fully controlled by this boolean — `true` renders the `w-60` expanded variant, `false` renders the `w-16` icon-strip. The toggle button in the header still works identically; staff can still collapse it any time by clicking the hamburger/X icon.

Mobile is completely unaffected — it uses the separate `mobileSidebarOpen` state and the bottom nav bar, both of which remain unchanged.
