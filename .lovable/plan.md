## Why the previous fixes didn't stick for Emma

I looked at what actually determines the two behaviors and I can see why Emma is still stuck:

**Landing redirect**
`isFullyOnboarded` is currently derived from `stages.every(s => s.status === 'complete')`. That means every stage — including **Stage 9 Payroll & Procedures (Pay Setup)** — has to be `complete`. Stage 9 only turns complete when `contractor_pay_setup.submitted_at` AND `terms_accepted` are set (OperatorPortal.tsx line 902). Plenty of drivers who are "live on the road" never finish that self-serve form, so `isFullyOnboarded` stays false and the redirect to `/home` never fires. That's almost certainly Emma's case: her Go Live date is set, but Stage 9 isn't submitted.

Your original ask was: *"a driver … completed 100% of the onboarding process and their Go Live date has been set … should land on the actual home page."* So Go Live date is the right signal — not stage 9 form submission.

**Sticky banner gap**
The sticky banner uses `top: 0`, which is correct — but its scroll container (OperatorPortal line 1446) has `py-6`. The mobile status wrapper only cancels part of it with `-mt-4`. That leaves ~8px of scroll-container padding sitting above the sticky banner at rest, which is the "sliver above/below" you see in the screenshot. Sticky pins to the padding edge, not the header, so the gap stays visible.

## Fix

### 1. `src/pages/operator/OperatorPortal.tsx`
Change the definition of `isFullyOnboarded` from stage-based to Go-Live-based:

```ts
const isFullyOnboarded = Boolean(onboardingStatus.go_live_date);
```

Everything downstream (the landing redirect at ~line 954, the home-base logic, the "Welcome" copy in the checklist, etc.) already reads from `isFullyOnboarded`, so this one change flips Emma — and every other driver with a Go Live date — onto `/home` on fresh entry while still allowing them to open the Progress screen manually via "View onboarding status".

### 2. `src/components/operator/OperatorStatusPage.tsx`
Cancel the full `py-6` padding of the parent scroll container on the mobile checklist wrapper so the sticky banner sits flush under the black header:

```diff
- <div className="md:hidden -mx-4 -mt-4">
+ <div className="md:hidden -mx-4 -mt-6 -mb-6">
```

This removes the top sliver (and the matching bottom padding sliver above the fixed bottom nav) without touching desktop or any other view. The banner is already `sticky top-0`, so once the padding is gone it will pin flush against the header on every scroll position.

### Not changing
- The stage-completion logic itself — Stage 9's "complete" rule is still meaningful for the checklist UI.
- Any other view's padding — only the mobile status wrapper is adjusted.
- Back-button / navigation logic — that piece is already working per your last report.
