import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
  sendTemplateEmail,
} from '../_shared/email/index.ts'
import { buildAppUrl } from '../_shared/app-url.ts'

// Creates a tokenized, watermarked ICA review link and emails it to a prospect.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, {
    roles: ['management', 'onboarding_staff', 'owner', 'dispatcher'],
  })
  if (auth instanceof Response) return auth
  const { supabase, authHeader, userId } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Invalid JSON body')
  }

  const recipientName = String(body.recipientName ?? '').trim()
  const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase()
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null

  if (!recipientName || recipientName.length > 200) {
    return fail(400, 'Recipient name is required (max 200 characters).')
  }
  if (!EMAIL_RE.test(recipientEmail) || recipientEmail.length > 320) {
    return fail(400, 'A valid recipient email address is required.')
  }

  const { data: link, error: insertError } = await supabase
    .from('ica_review_links')
    .insert({
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      note,
      created_by: userId,
    })
    .select('token, expires_at')
    .single()

  if (insertError || !link) {
    return fail(500, 'Could not create the review link', { cause: insertError?.message })
  }

  const reviewUrl = buildAppUrl(`/ica/review/${link.token}`)
  const expiresOn = new Date(link.expires_at as string).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
  })

  const result = await sendTemplateEmail({
    supabase,
    authHeader,
    templateName: 'ica-review-copy',
    recipientEmail,
    idempotencyKey: `ica-review-${link.token}`,
    templateData: { recipientName, reviewUrl, note: note ?? undefined, expiresOn },
  })

  if (!result.success) {
    return fail(502, 'The review link was created but the email could not be sent.', {
      cause: result.error,
      reviewUrl,
    })
  }

  return ok({ reviewUrl, expiresOn })
}))