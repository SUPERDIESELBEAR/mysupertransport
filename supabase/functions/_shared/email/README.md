# Shared email helper (`_shared/email/`)

Every edge function that sends email should route through this helper. It
standardizes the three things we kept getting wrong:

1. **Auth** — one call, one correct RPC parameter name, one 401/403 shape.
2. **Errors** — every response, including throws, comes back with CORS
   headers and a readable JSON body. The browser never sees a bare
   `"non-2xx status code"` without details.
3. **Sending** — either enqueue a registered template (preferred) or make
   a hardened direct-Resend call. Both paths write to `email_send_log`,
   check the suppression list, and surface provider errors verbatim.

## Template for a new email function

```ts
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
  sendTemplateEmail,
} from '../_shared/email/index.ts';

Deno.serve(withErrorEnvelope(async (req) => {
  // 1. Auth — one call.
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;
  const { supabase, authHeader, userId } = auth;

  // 2. Validate input.
  const body = await req.json().catch(() => null);
  if (!body?.operatorId) return fail(400, 'operatorId is required');

  // 3. Send via a registered template.
  const result = await sendTemplateEmail({
    supabase,
    authHeader,
    templateName: 'my-registered-template',
    recipientEmail: body.email,
    idempotencyKey: `my-event-${body.operatorId}`,
    templateData: { name: body.name },
  });

  if (!result.success) {
    return fail(502, result.error ?? 'Send failed', result.details);
  }
  return ok({ success: true, queued: true });
}, 'my-function-name'));
```

## When to use `sendResendDirect` instead

Only when the queue path can't cover the case — for example large PDF
attachments or dynamic multi-recipient CC/Reply-To lists. Direct sends
still check suppression, enforce a 20MB attachment cap, and log to
`email_send_log`.

## Do NOT

- Do not read `app_metadata.roles` for authorization. Roles rarely land in
  the JWT. `requireStaff` always queries `user_roles` with the service
  client.
- Do not call `get_user_roles(...)` from an edge function. The DB
  parameter name changed once already; `requireStaff` uses a direct
  `.from('user_roles').select(...)` query that can't drift.
- Do not hardcode `from:` addresses. Use `buildFrom(role)` from
  `sender.ts`.
- Do not throw uncaught errors. Wrap `Deno.serve(...)` with
  `withErrorEnvelope(handler, functionName)` so the browser gets JSON.
- Do not return a raw `Response` without `corsHeaders`. Use `ok()` /
  `fail()`.