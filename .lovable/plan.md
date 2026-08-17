# ICA Review Link Shows 404

## What's happening

The email button points at the live site (`mysupertransport.lovable.app/ica/review/...`). The review page exists in the current code and works in preview, but the live site is still serving an older build that doesn't know that address — so the app falls through to its own "404 Oops! Page not found" screen. I confirmed this: the published JavaScript bundle contains no `/ica/review` route, while the preview responds normally.

## Fix

Publish the app. That deploys the review page to the live site and the existing emailed links start working immediately — the tokens already stored in the database stay valid, no re-send needed.

## Follow-up worth doing at the same time

The link is built from an `APP_URL` setting that is currently invalid, so the function falls back to the live site address (which is the right one anyway). Options:

1. Leave as-is — the fallback is correct today.
2. Clean up the `APP_URL` value so the warning stops appearing in the function logs.

No code changes are required for the 404 itself.
