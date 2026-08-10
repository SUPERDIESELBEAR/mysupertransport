# Fix Yes/No pill colors in the application review drawer

Today every Yes/No pill in the drawer treats YES as bad (red) and NO as good (green). That is correct for risk questions (accidents, violations, positive drug test, SAP), but wrong for questions where YES is the expected, compliant answer.

## What changes

In the Authorizations & Signature section, and for 10-Year CDL History:
- YES renders green (the good/expected state)
- NO renders red (an alert that something is missing)

Everything else in Driving Record & Disclosures keeps today's colors: YES red, NO green. Missing values keep the muted em dash.

Fields flipped to "YES is good":
- 10-Year CDL History
- Auth: Safety History
- Auth: Drug/Alcohol
- Auth: Previous Employers
- Testing Policy Accepted
- Return to Duty Docs (having the documentation is the good outcome)

## Technical detail

`YesNoBadge` in `src/components/management/ApplicationReviewDrawer.tsx` gains an optional `positive` (invert) prop. When set, YES uses the `status-complete` token styling and NO uses the `destructive` token styling; default behavior is unchanged. The listed `<Field>` usages pass the new prop. No data or logic changes.
