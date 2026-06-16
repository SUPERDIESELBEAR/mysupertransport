## Summary
Update the shared `/login` page to show **"Driver Sign In"** when accessed from the forward-facing driver app, while keeping **"Staff Sign In"** for management dashboard access.

## Plan

### 1. LoginPage conditional heading
In `src/pages/LoginPage.tsx`, read the `type` query parameter from the URL.
- If `type=driver`, render heading **"Driver Sign In"** and subtitle **"Driver Portal"**.
- Otherwise, default to **"Staff Sign In"** and **"Operator Portal"** (current behavior).

### 2. Update driver-facing login links
Change hardcoded `/login` links that serve drivers/operators to `/login?type=driver`:
- `src/pages/SplashPage.tsx` — header "Sign In" link and footer "Sign In" link.
- `src/pages/WelcomeOperator.tsx` — "Already have an account? Sign in" fallback link.
- Audit `src/pages/InstallApp.tsx` and `src/pages/ApplicationStatus.tsx` for any other driver-facing login links and update them if found.

### 3. Verify with preview
After implementation, navigate to `/login` (staff path) and `/login?type=driver` (driver path) in the preview to confirm the correct headings appear.

## Technical Details
- Use `useSearchParams` from `react-router-dom` to read the query parameter.
- The conditional only affects the `<h2>` heading and subtitle `<p>` text; no auth logic changes.
- No backend or route changes required.