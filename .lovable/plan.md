# DOT Consultant — remove hardcoded name, make it configurable

Yes, the plan makes sense. Today "Tracey L. McQuilken" and `tracey@iondot.net` are hardcoded in four places (Stage 8 email block, the deactivation wizard, the Notify Safety Advisor dialog, and the two email backends). The fix is to store the DOT Consultant as a single saved setting and label everything generically in the UI.

## What changes for staff

**Labels — the name disappears from the UI, everywhere it currently appears:**

| Where | Now | After |
|---|---|---|
| Onboarding Pipeline, Stage 8 | "Email Tracey McQuilken (DOT Consultant)" | "Email DOT Consultant" |
| Deactivation wizard, Step 2 | "Notify Tracey McQuilken of the deactivation" | "Notify the DOT Consultant of the deactivation" |
| Deactivation confirmation | "Notice sent to Tracey L. McQuilken" | "Notice sent to the DOT Consultant" |
| Recipient chips in both dialogs | "Tracey L. McQuilken <tracey@iondot.net>" | the saved consultant name, or the raw email if not the saved consultant |
| Blocking banner on a deactivated driver | "...Tracey McQuilken has not yet been emailed" | "...the DOT Consultant has not yet been emailed" |
| Stage 8 notes label + send button | "NOTES TO TRACEY MCQUILKEN" / "Email Tracey McQuilken" | "NOTES TO THE DOT CONSULTANT" / "Email DOT Consultant" |
| Deactivation email greeting | "Hi Tracey, please find the deactivation details below." | "Hi {greeting name}, please find the deactivation details below." from the saved setting |
| Helper text / toasts / Staff Help article | Tracey by name | DOT Consultant |

**One saved DOT Consultant record.** In the same place staff already edit the recipient list (Stage 8's "To" block, and mirrored in the deactivation notice dialog), two fields are added above the email chips:

- **Consultant name** — e.g. "Tracey L. McQuilken". Shown next to their email in recipient chips.
- **Email greeting name** — e.g. "Tracey". Used to build the email's opening line: "Hi Tracey, please find the deactivation details below." Left blank, the greeting falls back to "Hello, please find the deactivation details below."

Both save with the existing "Save as default" action, so the change applies in every place the consultant is referenced. Any staff member with access to that panel can change them; the change is written to the audit log.

**Per-send override — yes, the greeting is editable before every send.** Both send screens (Stage 8 and the deactivation notice) get a small **Greeting** input sitting just above the message/notes box:

```text
GREETING
[ Hi  ][ Tracey                    ]   -> preview: "Hi Tracey, please find the deactivation details below."
                                        [ Save as default ]
```

How it behaves:

- The field is pre-filled with the saved greeting name, so the normal case is send-and-go — nothing to type.
- The sender can type over it for that one send (e.g. "Dana", or "Dana and team"). That edit affects only that email and does not change the saved default.
- A live one-line preview under the field shows the exact opening sentence the recipient will see, so there is never a "{greeting name}" placeholder in a real email.
- Clear the field and the email opens with "Hello, please find the deactivation details below." — no dangling comma or blank name.
- A separate "Save as default" action next to the recipient list writes the typed value back to the saved DOT Consultant record, so future sends start from the new name.
- The greeting is sent to the backend with the send request; the backend uses the saved value only when no greeting is supplied (e.g. an automated send).

The To list stays editable per send exactly as it is today.

**"Was the consultant actually notified?" logic.** Right now the system decides whether a deactivation was properly reported by checking for the literal address `tracey@iondot.net`. That becomes: notified only if the To list contains the saved consultant's email. So a test send (consultant removed) still leaves the "notification required" banner up, exactly as today, but keeps working if the consultant changes.

## Technical notes

- Migration: add `consultant_name text` and `greeting_name text` to `public.dot_consultant_email_settings` (single-row config, id `...0001`), backfilled with "Tracey L. McQuilken" / "Tracey" so nothing changes on day one. Existing grants/RLS (staff read, staff update) already cover it.
- `src/pages/staff/OperatorDetailPanel.tsx`: drop the `dotConsultantLabel` email-match hack; load/save the two new fields alongside `recipient_emails`; update Stage 8 headings, helper text and the deactivation banner.
- `src/components/staff/NotifySafetyAdvisorDialog.tsx` and `src/components/management/DeactivationWizardContent.tsx`: remove the `RECIPIENT_EMAIL` / `RECIPIENT_NAME` / `SAFETY_ADVISOR_*` constants, read the saved settings row instead, add the consultant-name and per-send greeting inputs, and pass `greeting_name` in the invoke payload.
- `supabase/functions/send-deactivation-notice/index.ts`: accept an optional `greeting_name` in the request body (validated, trimmed, max ~60 chars, HTML-escaped) and fall back to the settings row, then "Hello"; replace `includesTracey` with a `consultant_included` check against the saved email; rename the response field (`tracey_included` -> `consultant_included`) and the audit metadata key, updating the one caller.
- `supabase/functions/send-dot-consultant-request/index.ts`: replace `DEFAULT_RECIPIENT_EMAIL` with the settings row and apply the same optional per-send greeting.
- `src/lib/staffHelp/help-index.ts`: retitle the "Email Tracey McQuilken" article to "Email the DOT Consultant" and refresh its steps/keywords (keeping "tracey" as a search keyword so existing searches still land).
