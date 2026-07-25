# Email helpers

Every staff-triggered edge function that sends email or exposes a JSON
endpoint should route through these helpers. They exist to prevent the
recurring bug classes we've hit repeatedly:

- Hand-rolled `mysupertransport.lovable.app` links that bypass the
  marketing-host guard and land the user on the wrong site.
- Role-check drift (`admin` vs real `app_role` enum members) that returns
  a 500 the frontend surfaces as an opaque "non-2xx" toast.
- Ad-hoc CORS on error responses that hides the real message from the
  browser.
- Direct Resend calls that skip the retry queue.

## Canonical shape

```ts
import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
  sendTemplateEmail,
  buildAppUrl,
} from '../_shared/email/index.ts';

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, {
    roles: ['owner', 'management', 'onboarding_staff'],
  });
  if (auth instanceof Response) return auth;
  const { supabase, authHeader, userId } = auth;

  const body = await req.json();
  // ...validate body...

  const link = buildAppUrl(`/some/route/${body.token}`);

  const result = await sendTemplateEmail({
    supabase,
    authHeader,
    templateName: 'my-template',
    recipientEmail: body.email,
    idempotencyKey: `my-template-${body.id}`,
    templateData: { link },
  });
  if (!result.success) return fail(502, 'Send failed', result.error);

  return ok({ success: true });
}, 'my-function-name'));
```

## Rules

1. **Always** import `buildAppUrl` from this barrel — never hard-code the
   published origin, and never build links from `SUPABASE_URL`. The
   sanitizer rejects marketing hosts, IPs, and bare hostnames.
2. **Always** wrap the handler in `withErrorEnvelope` so uncaught
   throws come back as JSON with CORS headers (not a bare 500 the
   browser turns into "Failed to fetch").
3. **Always** authenticate staff through `requireStaff`. It validates
   the JWT with `getClaims`, looks up `user_roles` with the service
   client, and warns on unknown enum roles at first call.
4. **Prefer** `sendTemplateEmail` (queue-backed, retries) over
   `sendResendDirect`. Only bypass the queue when the recipient must see
   the email in the same request cycle (e.g. one-off previews).
5. **Always** pass an `idempotencyKey` derived from the triggering
   entity ID + template name.

## When something breaks

- Frontend shows "Edge Function returned a non-2xx status code":
  the call site isn't using `getEdgeFunctionErrorMessage` from
  `src/lib/edgeFunctionError.ts`. The envelope is already correct;
  the UI just isn't parsing it.
- Log shows `invalid input value for enum app_role`: a role passed to
  `requireStaff` isn't in the DB enum. The warning from
  `assertKnownRoles` in `auth.ts` will name the offender at boot.
- Email link opens the marketing site: the runtime's `APP_URL` is
  unset or misconfigured. `buildAppUrl` logs the rejection reason and
  falls back to the published app URL — check the function logs.