

## Add Reusable "Request Missing SSN" Email with Send Button

### Summary

Add a new reusable email template to the Email Catalog and a dedicated "Request SSN" button in the Application Review Drawer. The email includes a direct link to a new lightweight public page (`/apply/ssn`) where the applicant can submit just their SSN without re-filling the entire application.

### Changes

**1. New public page: `src/pages/SubmitSSN.tsx`**

A simple standalone page at `/apply/ssn?id=<application_id>` that:
- Shows the SUPERTRANSPORT branding (same header as the application form)
- Displays a single SSN input field with XXX-XX-XXXX masking
- On submit: calls `encrypt-ssn`, updates `applications.ssn_encrypted`, shows a success message
- No auth required (same anonymous access pattern as the application form)
- Validates the application ID exists before showing the form

**2. Route registration: `src/App.tsx`**

Add `<Route path="/apply/ssn" element={<SubmitSSN />} />` as a public route.

**3. New notification type in `supabase/functions/send-notification/index.ts`**

Add a `request_ssn` case that:
- Accepts `applicant_name`, `applicant_email`, and `application_id`
- Builds the branded email with the professional wording (apology for the inconvenience, link to submit SSN)
- CTA button links to `{appUrl}/apply/ssn?id={application_id}`

**4. Email template in `src/components/management/EmailCatalog.tsx`**

Add a new template entry (`id: 'request_ssn'`) in the TEMPLATES array under a new "notifications" or "documents" category so it appears in the Content Manager for preview.

**5. "Request SSN" button in `src/components/management/ApplicationReviewDrawer.tsx`**

In the SSN section, when SSN is missing (the manual entry area), add a secondary button: **"Email Applicant to Request SSN"** that:
- Calls `send-notification` with `type: 'request_ssn'`
- Passes the applicant's name, email, and application ID
- Shows a toast on success: "SSN request email sent to {name}"
- Disables for 60 seconds after sending to prevent spam

### Email Content

Subject: `Action Needed: Please Update Your Application — SUPERTRANSPORT`

Body: Professional apology email explaining a minor technical issue prevented their SSN from being saved, with a CTA button "Update My Application" linking to `/apply/ssn?id=...`.

### How You'll Send It

From the Management Portal → Applications → open any applicant's review drawer → scroll to the SSN section. If no SSN is on file, you'll see both:
- A manual SSN entry field (already built)
- A new **"Email Applicant to Request SSN"** button

One click sends the branded email to the applicant's email address on file.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/SubmitSSN.tsx` | New lightweight SSN submission page |
| `src/App.tsx` | Add `/apply/ssn` route |
| `supabase/functions/send-notification/index.ts` | Add `request_ssn` notification type |
| `src/components/management/ApplicationReviewDrawer.tsx` | Add "Email Applicant to Request SSN" button |
| `src/components/management/EmailCatalog.tsx` | Add template preview entry |

