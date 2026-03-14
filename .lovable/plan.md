
The fix is a single-line change on line 310-312 of `src/pages/WelcomeOperator.tsx`.

The "Questions? Contact us at" line currently links to `dispatch@mysupertransport.com`. Per the agreed strategy, this footer contact should be `support@mysupertransport.com` — `dispatch@` is only for active dispatch coordination, not general help inquiries.

## Change

**File:** `src/pages/WelcomeOperator.tsx` — lines 310–312

- `href="mailto:dispatch@mysupertransport.com"` → `href="mailto:support@mysupertransport.com"`
- Link text `dispatch@mysupertransport.com` → `support@mysupertransport.com`

The `dispatch@` email address used elsewhere on the Welcome page (in the feature cards pointing operators to their dispatcher) is untouched — only the "Questions? Contact us at" footer link changes.
