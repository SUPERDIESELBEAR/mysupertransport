

## Create Test Operator Account for marcsmueller@gmail.com

### What it does
Sets up a fully functional test operator account that you can log into on your phone to experience the app exactly as an owner-operator would. The account will be named "Marcus Mueller (Test)" to distinguish it from your owner account.

### Approach
Create a one-time setup edge function (`create-test-operator`) that provisions the full operator stack in one call:

1. **Auth user** -- creates marcsmueller@gmail.com in the auth system with a confirmed email
2. **Profile** -- first name "Marcus", last name "Mueller"
3. **Role** -- assigns the `operator` role
4. **Application record** -- a minimal approved application so the pipeline and operator detail views work
5. **Operator record** -- links to the application
6. **Onboarding status** -- starts at Stage 1 (background checks not started) so you can walk through the full onboarding experience
7. **Password** -- you'll set it via the reset-password flow (the function sends an invite email to marcsmueller@gmail.com with a link)

### After setup
- Open the invite email on your phone
- Set your password
- Log in at mysupertransport.lovable.app/login
- You'll land in the Operator Portal and see the full onboarding experience from Stage 1

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/create-test-operator/index.ts` | New one-time edge function that creates the auth user, profile, role, application, operator, and onboarding_status records |

### Security note
The function requires the same `BOOTSTRAP_SECRET` used by bootstrap-admin, so only you can call it. It can be deleted after use.

