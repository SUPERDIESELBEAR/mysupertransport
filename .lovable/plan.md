
## Logo resize — 3 standalone logos only

Increase only the centered, full-page logos to `h-28` (112 px). The dark sticky nav-bar ribbons (Application Form header at line 388, Splash Page nav) are left exactly as they are.

### Changes

| File | Line | Current | New |
|---|---|---|---|
| `src/pages/LoginPage.tsx` | 70 | `h-20 w-auto max-w-[320px]` | `h-28 w-auto max-w-[400px]` |
| `src/pages/ApplicationStatus.tsx` | 16 | `h-20 max-w-[320px]` | `h-28 max-w-[400px]` |
| `src/pages/ApplicationForm.tsx` | 351 | `h-16 w-auto max-w-[240px]` | `h-28 w-auto max-w-[400px]` |

Line 388 (Application Form black ribbon logo, `h-10`) is untouched.

3 files · 3 `<img>` class edits · no logic, layout, or nav changes.
