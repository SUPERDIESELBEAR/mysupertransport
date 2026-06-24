## Plan
Send a fresh test QPassport email to verify the new viewer end-to-end.

### Steps
1. Invoke `send-test-email` with:
   - `operator_email`: `emmafmueller@gmail.com` (so the link is bound to Emma's QPassport)
   - `to`: `emma@mysupertransport.com` (delivery inbox)
2. Confirm the function returns OK and that the email link points to `/qpassport/view?token=…`.
3. You open the email and click **Open QPassport**, then confirm:
   - Emma's QPassport renders as a static image on the page.
   - The file auto-downloads (or downloads when you tap the header **Download** button on mobile).

### Important
The published site (`mysupertransport.lovable.app`) must be on the latest build that includes the `/qpassport/view` route, otherwise the link will 404. If you haven't clicked **Update** in the Publish dialog since the route was added, do that first.