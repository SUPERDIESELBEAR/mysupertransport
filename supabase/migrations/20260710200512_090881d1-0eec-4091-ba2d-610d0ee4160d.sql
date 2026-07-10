
-- Hand-authored FAQ drafts from codebase scan. All inserted unpublished.
INSERT INTO public.faq (question, answer, category, audience, tags, is_published, source_document, source_section) VALUES

-- ============================================================
-- OWNER-OPERATOR (Driver App) FAQs
-- ============================================================

('How do I install the SUPERDRIVE app on my phone?',
'SUPERDRIVE is a Progressive Web App (PWA), so there is nothing to download from the App Store or Play Store.

**iPhone (Safari):** Tap the Share icon at the bottom of the screen, then tap **Add to Home Screen**.

**Android (Chrome):** Tap the three-dot menu in the top right, then tap **Install app** or **Add to Home Screen**.

Once installed, SUPERDRIVE opens like any other app from your home screen. You may see a reminder banner inside the app if you have not installed it yet.',
'general_owner_operator', 'owner_operator', ARRAY['install','pwa','home screen','iphone','android'], false, 'hand-authored codebase scan', 'PWA Install'),

('Why does the app ask me to re-sign in every so often?',
'For security, SUPERDRIVE signs you out automatically after **120 minutes of inactivity**. Just sign back in with your email and password — none of your data is lost.',
'general_owner_operator', 'owner_operator', ARRAY['login','session','timeout','security'], false, 'hand-authored codebase scan', 'Authentication'),

('I forgot my password. How do I reset it?',
'On the sign-in screen, tap **Forgot password?** and enter your email. You will get a reset link. Open it on your phone and set a new password. If you do not see the email within a few minutes, check spam or contact your onboarding coordinator.',
'general_owner_operator', 'owner_operator', ARRAY['login','password','reset'], false, 'hand-authored codebase scan', 'Authentication'),

('What do the stages on my Status page mean?',
'The Status page shows your onboarding progress from start to Go Live. Each stage unlocks the next:

1. **Application** — submitted and approved
2. **Background Check** — MVR and criminal history clearance
3. **Documents** — CDL, Medical Cert, and other required uploads
4. **ICA** — Independent Contractor Agreement signed
5. **Equipment Setup** — truck, plates, and onboard devices assigned
6. **Pre-Employment Screening (PEI)** — previous-employer verifications
7. **Insurance** — policy on file
8. **Pay Setup** — direct deposit and pay election
9. **Go Live** — cleared to run loads

If a stage is locked, finish the one before it first.',
'general_owner_operator', 'owner_operator', ARRAY['status','stages','progress','go live','onboarding'], false, 'hand-authored codebase scan', 'Driver Status Page'),

('What does "Go Live" mean?',
'Go Live means you have completed every onboarding step and are cleared to accept loads. Only Go Live drivers appear on the dispatcher''s active roster and in the Fleet Compliance Summary.',
'general_owner_operator', 'owner_operator', ARRAY['go live','active','dispatch'], false, 'hand-authored codebase scan', 'Driver Status Page'),

('How do I upload my CDL, Medical Card, or IRP?',
'From your Status page, open the **Documents** stage and tap the item you need to upload. You can either take a photo with your phone camera or pick a PDF from your files. Front and back are usually required for the CDL. If the document has an expiration date, enter it — the system uses that to remind you before it expires.',
'documents_requirements', 'owner_operator', ARRAY['upload','cdl','medical','irp','documents'], false, 'hand-authored codebase scan', 'Document Upload'),

('The camera opens the wrong way when I try to take a truck photo. What do I do?',
'When uploading truck photos, SUPERDRIVE asks the phone for the **rear (environment) camera** since you are photographing the truck. If your phone opens the selfie camera, tap the camera-flip icon inside the camera view. You can also close the camera and choose **Choose from Library** to upload a photo you already took.',
'equipment', 'owner_operator', ARRAY['truck photos','camera','upload'], false, 'hand-authored codebase scan', 'Truck Photo Upload'),

('How do I sign my ICA (contract)?',
'Open the **ICA** stage on your Status page and tap **Sign**. A signature canvas appears — sign with your finger or stylus. If you rotate your phone or the box resizes, sign again inside the box before submitting. Once signed, a green **ICA Agreement Signed** banner appears on your Status page.',
'ica_contracts', 'owner_operator', ARRAY['ica','contract','signature','sign'], false, 'hand-authored codebase scan', 'ICA Signing'),

('Why do I have to verify each item on the Equipment Asset Sheet before signing?',
'The Asset Sheet is your record of every piece of company equipment in your possession (ELD, BestPass, fuel card, decals, etc.). Each item has a **Verify** toggle. You must verify every item so the sheet is accurate before you sign. The **Sign** button stays disabled until all items are verified.',
'equipment', 'owner_operator', ARRAY['equipment','asset sheet','verify','signature'], false, 'hand-authored codebase scan', 'Equipment Asset Sheet'),

('An item on my Asset Sheet is missing or wrong. What should I do?',
'Do **not** verify it. Message your onboarding coordinator or dispatcher through the Messages tab and let them know exactly what is missing or wrong. They will update the list before you sign.',
'equipment', 'owner_operator', ARRAY['equipment','missing','issue'], false, 'hand-authored codebase scan', 'Equipment Asset Sheet'),

('What is a PEI and why are you emailing my previous employers?',
'PEI stands for **Pre-Employment Screening / Investigation**. FMCSA requires us to verify your last 3 years of DOT employment history. We email each previous employer a short questionnaire. You do not have to do anything — just make sure the employer contacts you gave us are correct. If an employer does not respond within 30 days, we document the good-faith attempt (GFE) and continue.',
'background_screening', 'owner_operator', ARRAY['pei','background','previous employer','fmcsa'], false, 'hand-authored codebase scan', 'Pre-Employment Screening'),

('How do I check my messages?',
'Tap the **Messages** icon in the bottom navigation. The inbox shows conversations with staff. Tap any thread to open it and reply. New messages also appear as notifications in the bell icon.',
'general_owner_operator', 'owner_operator', ARRAY['messages','inbox','chat'], false, 'hand-authored codebase scan', 'Messages'),

('I tapped the notification bell and clicked "View all" — where does it go?',
'**View all →** opens your Messages screen on the **Notifications** tab, where you can see every alert (compliance reminders, dispatch updates, staff replies) in one place.',
'general_owner_operator', 'owner_operator', ARRAY['notifications','messages'], false, 'hand-authored codebase scan', 'Notifications'),

('What is that alarm sound I hear in the app?',
'That is a **Truck Down alert**. It means a truck in the fleet has been reported down and staff need immediate attention. If it is not your truck, you can dismiss the banner. If it is your truck, tap the banner to see instructions.',
'general_owner_operator', 'owner_operator', ARRAY['truck down','alert','sound'], false, 'hand-authored codebase scan', 'Truck Down Alerts'),

('How do I know when a document is about to expire?',
'The Compliance area on your Status page shows the countdown for each dated document (CDL, Med Cert, IRP, insurance, etc.). Items expiring within 60 days show a yellow warning; items expiring within 30 days show red. You will also get a notification and, in some cases, an email reminder.',
'documents_requirements', 'owner_operator', ARRAY['compliance','expiration','reminder'], false, 'hand-authored codebase scan', 'Compliance Timeline'),

('When I tap a photo or document, it used to open in a new browser tab. Now what?',
'Photos and documents now open in a **preview window** inside the app. Tap the X or the background to close and go right back to where you were. No more losing your place.',
'general_owner_operator', 'owner_operator', ARRAY['preview','photo','document','modal'], false, 'hand-authored codebase scan', 'In-App Preview'),

('Where do I find the Driver Handbook, BOL/POD instructions, and other resources?',
'Open the **Resources** tab (or the **Documents** section, depending on your view). You will find the SUPERTRANSPORT Handbook, BOL/POD procedures, and any other reference materials staff have uploaded. They open in the in-app viewer — no new tab.',
'documents_requirements', 'owner_operator', ARRAY['handbook','bol','pod','resources'], false, 'hand-authored codebase scan', 'Resources'),

('I am leaving the company. How do I return my equipment?',
'When you are terminated or resign, staff send you **Mailing Instructions** (a UPS Store or PO Box address) through the app. Ship the equipment listed in your Asset Sheet, then upload the **shipping receipt** in the Asset Sheet screen. Your login stays active until at least one receipt is uploaded so you can complete the return.',
'equipment', 'owner_operator', ARRAY['return','termination','shipping','equipment'], false, 'hand-authored codebase scan', 'Equipment Return'),

('Do I need to keep the app open to receive notifications?',
'No. As long as you have installed SUPERDRIVE to your home screen and allowed notifications, alerts arrive even when the app is closed. You can also see everything in the bell icon and the Notifications tab.',
'general_owner_operator', 'owner_operator', ARRAY['notifications','background','pwa'], false, 'hand-authored codebase scan', 'Notifications'),

('The sidebar menu opens but tapping a page does not always take me there. Is that fixed?',
'Yes — the navigation race condition in the hamburger menu was fixed. If you ever get stuck, close and reopen the app and it will land on the correct page.',
'general_owner_operator', 'owner_operator', ARRAY['navigation','menu','bug'], false, 'hand-authored codebase scan', 'Navigation'),

('Where do I set up direct deposit?',
'On your Status page, open the **Pay Setup** stage. You will enter your bank routing and account numbers and choose your pay election. Everee handles the actual payroll processing. Pay cycles run Wednesday to Tuesday.',
'general_owner_operator', 'owner_operator', ARRAY['pay','direct deposit','everee','payroll'], false, 'hand-authored codebase scan', 'Pay Setup'),

('How do I update my address, phone number, or emergency contact?',
'Send a message to your onboarding coordinator or dispatcher through the Messages tab. Staff will update your profile — you do not need to redo your application.',
'general_owner_operator', 'owner_operator', ARRAY['profile','contact info','update'], false, 'hand-authored codebase scan', 'Profile Updates'),

('What if my truck goes down on the road?',
'Contact dispatch immediately through the Messages tab or by phone. Dispatch will mark the truck down in the system, which triggers the fleet-wide alert so maintenance and management can respond.',
'dispatch_operations', 'owner_operator', ARRAY['truck down','breakdown','dispatch'], false, 'hand-authored codebase scan', 'Dispatch'),

('Can I use SUPERDRIVE on a tablet or computer?',
'Yes. SUPERDRIVE is a web app, so it works in any modern browser on a tablet or computer as well as your phone. Signing documents works best on a touchscreen device.',
'general_owner_operator', 'owner_operator', ARRAY['tablet','computer','browser','device'], false, 'hand-authored codebase scan', 'Device Support'),

('Where can I see all the FAQs available to me?',
'Open the **FAQ** tab. You will see a searchable list of questions. Use the search box at the top to type keywords — the list filters as you type.',
'general_owner_operator', 'owner_operator', ARRAY['faq','help','search'], false, 'hand-authored codebase scan', 'FAQ Usage'),

-- ============================================================
-- STAFF (Management Portal) FAQs
-- ============================================================

('How do I move a driver through the onboarding pipeline?',
'Open **Onboarding Pipeline** in the sidebar and click the driver. Each stage card has action buttons — approve documents, mark equipment issued, request revisions, etc. Stages unlock based on the pipeline_config completion rules; you do not manually promote drivers between stages. Once the final stage clears, the system moves them to **Go Live** automatically.',
'application_process', 'staff', ARRAY['pipeline','onboarding','stages'], false, 'hand-authored codebase scan', 'Onboarding Pipeline'),

('How do I request a revision on a submitted application?',
'In the Onboarding Pipeline, open the driver and scroll to **Submitted Application**. Use the **Propose Changes** drawer to edit fields in place — the diff is highlighted in gold. Save to send a courtesy email (the default per-role checkbox controls whether the applicant is notified). Use **Revert Revision** to roll back a change if needed.',
'application_process', 'staff', ARRAY['revision','application','propose changes'], false, 'hand-authored codebase scan', 'Application Review'),

('What does the courtesy-email checkbox default to when reverting a revision?',
'Each staff role has its own default for the **Send courtesy email** checkbox in the Revert Revision modal (managed via `revert_courtesy_email_defaults`). You can override it per action. The default is set in that table so a role that always notifies will not accidentally skip an email.',
'application_process', 'staff', ARRAY['revert','email','courtesy'], false, 'hand-authored codebase scan', 'Revert Revision'),

('How do I add a previous employer to a PEI request?',
'Open the applicant, go to the **PEI** tab, and click **Add Previous Employer**. Fill in the employer info (fields start blank so you do not accidentally submit placeholder data). You can also click **Auto-build** to seed employers from the applicant''s employment history. The AI email lookup helps find the correct verification email address.',
'background_screening', 'staff', ARRAY['pei','previous employer','add'], false, 'hand-authored codebase scan', 'PEI Management'),

('How does PEI auto-cadence work?',
'After a staff member sends the initial PEI request to a previous employer, the system auto-sends follow-ups **every 5 days** for 30 days. If the employer has not responded by day 30, the system automatically creates a **Good Faith Effort (GFE)** record so the file is compliant. This runs via the `pei-auto-cadence` edge function on a daily cron.',
'background_screening', 'staff', ARRAY['pei','cadence','automation','gfe'], false, 'hand-authored codebase scan', 'PEI Auto-Cadence'),

('Why does a driver not appear in the Compliance Summary on the Overview page?',
'The Compliance Summary only lists **active, insured drivers past Go Live**. Applicants, drivers in onboarding, archived drivers, and deactivated drivers are excluded by design. If someone is missing, confirm they are marked active and have cleared insurance in their onboarding stage.',
'general_owner_operator', 'staff', ARRAY['compliance summary','overview','filter'], false, 'hand-authored codebase scan', 'Compliance Summary'),

('How do I open a driver''s inspection binder from Dispatch?',
'On the **Dispatch Board**, click the **Binder** button on any driver card. It jumps you to Driver Hub with that driver selected and auto-scrolls to the binder. Works from Management Portal and Dispatch Portal.',
'dispatch_operations', 'staff', ARRAY['binder','dispatch','driver hub'], false, 'hand-authored codebase scan', 'Dispatch Binder'),

('How do I assign a fuel card, ELD, or BestPass to a driver?',
'Open **Onboard Systems** in the sidebar (under Operations). Pick the item type, find an available (unassigned) item, and click assign. The assignment auto-syncs to that driver''s **Equipment Asset Sheet** and blocks duplicates across drivers.',
'equipment', 'staff', ARRAY['fuel card','eld','bestpass','onboard systems','assign'], false, 'hand-authored codebase scan', 'Onboard Systems'),

('How do I deactivate a fuel card?',
'In Onboard Systems, open the fuel card and use the **Deactivate** action. The card moves to the Deactivated section (archived list) and stops being available for new assignments. Use this instead of deleting — it preserves history.',
'equipment', 'staff', ARRAY['fuel card','deactivate'], false, 'hand-authored codebase scan', 'Onboard Systems'),

('Where do I see unassigned onboard equipment (inventory)?',
'Onboard Systems has an **Available** section that lists every unassigned card/device — that is your live inventory. Items marked **Deactivated** are archived and do not show up as available.',
'equipment', 'staff', ARRAY['inventory','available','onboard systems'], false, 'hand-authored codebase scan', 'Onboard Systems'),

('The Equipment Asset Sheet is collapsed. Is that normal?',
'Yes. The Asset Sheet is **collapsed by default** so staff who are not working on it do not scroll past everything. Click the chevron to expand it. Already-signed sheets auto-expand so you see the completed state at a glance.',
'equipment', 'staff', ARRAY['asset sheet','collapse','ui'], false, 'hand-authored codebase scan', 'Equipment Asset Sheet'),

('Why is the driver''s Sign button on the Asset Sheet disabled?',
'The **Sign** button unlocks only when every equipment item is marked **Verified by staff**. That gate prevents drivers from signing off on an incomplete or inaccurate list. Verify each item, then the driver can sign.',
'equipment', 'staff', ARRAY['asset sheet','verified','signature','gating'], false, 'hand-authored codebase scan', 'Equipment Asset Sheet'),

('How do I send equipment return instructions to a driver who is leaving?',
'On the driver''s Asset Sheet, use the **Send Return Instructions** action to email UPS Store or PO Box mailing details. The driver uploads a shipping receipt in-app. **Their login stays active until at least one receipt is uploaded** so they can complete the return.',
'equipment', 'staff', ARRAY['return','termination','shipping'], false, 'hand-authored codebase scan', 'Equipment Return'),

('An IRP expiration was updated in Driver Hub but the MO Plate Registry still shows the old date (or vice versa). What is happening?',
'Both directions sync automatically via database triggers (`sync_irp_expiry_to_mo_plate` and `sync_mo_plate_expiry_to_irp`). If a date looks stale, refresh the page — the trigger fires on save, not on view. If it is still wrong after refresh, confirm the plate assignment in MO Plate Registry actually points to that driver.',
'missouri_registration', 'staff', ARRAY['irp','mo plate','sync','expiration'], false, 'hand-authored codebase scan', 'IRP / MO Plate Sync'),

('How do I upload a policy document like the Handbook or BOL/POD?',
'Open **Document Hub** and use the upload flow under the Documents tab. Choose the category (Onboarding, Compliance, etc.). The file lands in the `resource-library` bucket and appears for drivers in their Resources tab.',
'documents_requirements', 'staff', ARRAY['upload','document hub','handbook','bol'], false, 'hand-authored codebase scan', 'Document Hub'),

('How do I turn a PDF document into FAQ drafts?',
'In **FAQ Manager**, click **Generate from document** and pick a PDF from the Resource Library. The `faq-generate-from-doc` edge function extracts the text, uses Gemini to draft Q&A pairs, and inserts them as **drafts** in FAQ Manager with the AI drafts filter chip. Review, edit, and publish anything worth keeping.',
'general_owner_operator', 'staff', ARRAY['faq','ai','generate','document'], false, 'hand-authored codebase scan', 'FAQ Manager'),

('How do I publish an FAQ draft so drivers or staff can see it?',
'In FAQ Manager, open the entry and click the **eye** icon to toggle it to Published. Owner-operator entries appear in the driver app''s FAQ tab; staff entries appear in the Staff Help Portal search.',
'general_owner_operator', 'staff', ARRAY['faq','publish','draft'], false, 'hand-authored codebase scan', 'FAQ Publishing'),

('What is the difference between the two audience toggles in FAQ Manager?',
'FAQ Manager has an audience toggle at the top: **Owner-Operator** (drivers see it in the app) and **Staff** (surfaces in the Staff Help Portal). Each entry belongs to exactly one audience. Toggle the view to manage each set separately.',
'general_owner_operator', 'staff', ARRAY['faq','audience','toggle'], false, 'hand-authored codebase scan', 'FAQ Manager'),

('How does the Staff Help Portal search work?',
'The Staff Help Portal uses Postgres full-text search over the `faq` table (question, answer, and tags). Type any keyword and results rank by relevance. Only **published** staff FAQs appear; drafts stay hidden.',
'general_owner_operator', 'staff', ARRAY['staff help','search','full-text'], false, 'hand-authored codebase scan', 'Staff Help Portal'),

('What is the "re-verify" prompt on an FAQ?',
'Each FAQ has a `last_verified_at` timestamp. When you post a Release Note that touches a feature, you can flag specific FAQs for **re-verification**. Those FAQs surface in the Staff Help Portal with a review prompt so staff can confirm the answer still matches the current UI.',
'general_owner_operator', 'staff', ARRAY['faq','re-verify','release notes'], false, 'hand-authored codebase scan', 'FAQ Re-Verification'),

('Where do I compose a Release Note?',
'Open **Release Notes** in the sidebar. Compose your note in the editor. Before saving, you can pick FAQs to flag for re-verification so staff know to double-check them once the release ships.',
'general_owner_operator', 'staff', ARRAY['release notes','composer','changelog'], false, 'hand-authored codebase scan', 'Release Notes'),

('Who can access which parts of the Management Portal?',
'Roles are stored in the `user_roles` table (never on the profiles table). The main roles are **owner**, **management**, **onboarding_staff**, **dispatcher**, and **operator**. Access is enforced by RLS and by the `has_role` security-definer function. Owner (Marcus Mueller) has the highest authority. See the Roles & Permissions memory for the full matrix.',
'general_owner_operator', 'staff', ARRAY['roles','permissions','security'], false, 'hand-authored codebase scan', 'Roles & Permissions'),

('Why does the Pending Invite Acceptance list not show a driver I invited?',
'Deactivated and archived operators are filtered out of the Pending Invite Acceptance list automatically. If someone is missing, check whether they were deactivated. Active invitees remain in the list until they accept.',
'application_process', 'staff', ARRAY['invite','pending','deactivated'], false, 'hand-authored codebase scan', 'Pending Invites'),

('How do I send a broadcast message to multiple drivers?',
'Use the **Operator Broadcasts** feature. Compose the message, pick recipients (individual drivers or a role/status filter), and send. Delivery status is tracked per-recipient in `operator_broadcast_recipients`.',
'general_owner_operator', 'staff', ARRAY['broadcast','messages','operators'], false, 'hand-authored codebase scan', 'Broadcasts'),

('A driver said they never got a compliance reminder email. Where do I check?',
'Look in `email_send_log` for that recipient. If the address is in `suppressed_emails` (bounced or unsubscribed), it will not receive automated reminders. Notification preferences are per-user in `notification_preferences`. If the driver has no email trace, confirm their `notification_preferences` row allows the reminder type.',
'general_owner_operator', 'staff', ARRAY['email','notifications','troubleshooting','reminders'], false, 'hand-authored codebase scan', 'Email Delivery'),

('How do I send a manual PWA install reminder to a driver?',
'Open the driver in the Management Portal and use the **Send PWA install reminder** action. There is a 24-hour cooldown per driver so you cannot spam them. A daily cron also handles bulk reminders automatically.',
'general_owner_operator', 'staff', ARRAY['pwa','install','reminder'], false, 'hand-authored codebase scan', 'PWA Install Reminders'),

('What is Demo Mode and how do I use it?',
'Demo Mode is a sessionStorage-based sandbox for showing the app without touching real data. When enabled, destructive actions and outbound emails are locked. Look for the demo banner at the top of the screen to confirm you are in demo mode.',
'general_owner_operator', 'staff', ARRAY['demo','sandbox','training'], false, 'hand-authored codebase scan', 'Demo Mode')

;
