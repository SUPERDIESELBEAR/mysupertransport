## Goal
Make the email button **Open QPassport** land on a working public page where the driver sees their own QPassport as a static image and the file downloads to their device.

## What I found
- The app code now includes `/qpassport/view`, but the screenshot is from the **published** site showing the app’s internal 404 page.
- That means the published build the email opened likely does not yet include the new route, or the email link was generated before the current viewer was live.

## Plan
1. **Verify the published link behavior**
   - Check the current published URL path `/qpassport/view` against the live site.
   - Confirm whether it is a publishing/version issue versus a route/link-generation issue.

2. **Ensure the viewer route is public and stable**
   - Keep `/qpassport/view?token=...` outside the login-protected routes.
   - Preserve the token-based fetch so each driver only loads their own QPassport.

3. **Confirm email link generation**
   - Verify QPassport emails generate links to `https://mysupertransport.lovable.app/qpassport/view?token=...`.
   - Ensure new test emails use that viewer link, not the raw file/download endpoint.

4. **Publish the latest app build if needed**
   - If the live site is behind the preview build, publish/update the app so `/qpassport/view` exists on `mysupertransport.lovable.app`.

5. **Retest end-to-end**
   - Send a fresh test QPassport email.
   - Click **Open QPassport** from the new email.
   - Confirm the page displays the QPassport as a static image and triggers a download, with the Download button as fallback on mobile/browser-blocked auto-downloads.