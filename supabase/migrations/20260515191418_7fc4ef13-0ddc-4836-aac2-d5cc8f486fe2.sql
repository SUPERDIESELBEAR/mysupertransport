
INSERT INTO public.email_templates (milestone_key, subject, heading, body_html, cta_label)
VALUES
  (
    'application_moved_to_pending',
    'Update on your SUPERTRANSPORT driver application',
    'Application Reopened',
    $$<p>Hi {{name}},</p>
<p>Good news — our team is reviewing your SUPERTRANSPORT driver application and has reopened it so we can take care of a few small corrections on your behalf.</p>
<div style="margin:0 0 18px;padding:14px 16px;background:#f1f8ff;border-left:4px solid #2c7be5;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 6px;font-weight:700;color:#1a4d8f;">What happens next</p>
  <p style="margin:0;">If any changes need your approval, you'll receive a separate email with a secure link to review and e-sign them. You don't need to log back in or resubmit anything right now.</p>
</div>
<p>Any earlier "please update your application" link we sent you has been retired and will no longer work — please disregard it.</p>
<p style="color:#666;font-size:13px;">Questions? Just reply to this email and our recruiting team will get back to you.</p>$$,
    ''
  ),
  (
    'application_correction_request',
    'Action needed: approve corrections to your SUPERTRANSPORT application',
    'Corrections Awaiting Approval',
    $$<p>Hi {{name}},</p>
<p>Our team has prepared a few corrections to your SUPERTRANSPORT driver application and needs your approval before they take effect.</p>
{{courtesy_block}}
<div style="margin:0 0 18px;padding:14px 16px;background:#fff7e0;border-left:4px solid #C9A84C;border-radius:6px;color:#222;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 6px;font-weight:700;color:#7a5b00;">Reason for these corrections:</p>
  <p style="margin:0;">{{reason}}</p>
</div>
<p style="margin:18px 0 8px;font-weight:700;">Proposed changes</p>
{{changes_table}}
<p>Click below to review the changes side-by-side and either approve them with your e-signature or reject them.</p>
<p style="color:#666;font-size:13px;">This secure link is valid for <strong>14 days</strong>. If you have questions, reply to this email.</p>$$,
    'Review & approve changes'
  )
ON CONFLICT (milestone_key) DO NOTHING;
