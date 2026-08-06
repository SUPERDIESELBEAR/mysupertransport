# Landing page resume/resend banner sizing

Goal: make the two circled action boxes on the SUPERDRIVE landing page the same width, with the bottom box matching the top box's length.

Current state: both banners are `inline-flex` buttons in `src/pages/SplashPage.tsx`. Because the text inside the bottom banner is shorter, the button shrinks to its content and ends up narrower than the top one.

## Proposed change

In `src/pages/SplashPage.tsx`, wrap the "Started an application?" and "Invited as a driver or truck owner?" buttons in a shared container with a fixed max-width, and make each button `w-full` so they both stretch to the same length regardless of content.

```text
Before: two inline-flex buttons with content-dependent widths
After:  container with max-w-lg + flex flex-col gap-3, each button w-full
```

- Keep the existing icon, text, hover, and rounded styling.
- Do not change any text, navigation, or dialog behavior.
- No backend or data changes.
