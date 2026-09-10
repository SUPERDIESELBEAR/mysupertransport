# Driver-side fuel parity: can it be demonstrated today?

Read-only investigation. Nothing was changed. Every claim below is from current source (file paths given) unless marked as a live query.

## 1. Does such a feature exist?

Yes — **two different things**, and only one of them is a real driver session.

**A. Operator Preview (in-app, on the owner's screen)**
- `src/components/operator/OperatorPreviewPicker.tsx`, reached from the staff portal (`src/pages/staff/StaffPortal.tsx`).
- Pick a driver, and `OperatorPortal` is rendered with a `previewUserId` prop (`src/pages/operator/OperatorPortal.tsx:104`). Read-only, labelled "Change Operator".

**B. Mobile Preview (QR handoff — a genuine driver sign-in)**
- Phone icon on each card in the same picker, management/owner only, opens `src/components/staff/MobilePreviewQRModal.tsx`.
- `supabase/functions/create-preview-session` checks the caller is management/owner, checks the target holds the `operator` role and is not an owner, revokes older unused codes, stores a SHA-256 hash of a 32-byte code with a 3-minute expiry, and audits `preview_session_created`.
- Scanning opens `/preview-login` (`src/App.tsx:187` → `src/pages/PreviewLogin.tsx`), which calls `redeem-preview-session`. That function burns the code single-use, then mints a magic-link `token_hash` for the driver's own email and the browser calls `verifyOtp`. Redemption is audited too.

## 2. How each one works — what identity the database sees

**A. In-app Operator Preview — proves nothing about isolation.**
`auth.uid()` stays the **owner's**. The preview works by passing a driver's user id down as a prop and reading through the owner's own management-privileged access. Worse for this specific question: `MyFuel` (`src/components/operator/MyFuel/index.tsx`) takes **no** user id at all — it calls `fetchMyFuel()` → `my_fuel_transactions()`, which resolves the operator from `auth.uid()`. Rendered inside the preview, that call runs as the owner, so it returns the owner's rows (the owner is not an operator, so: nothing). This screen can answer "does the layout look right", and not even that for My Fuel. It cannot answer "is a driver's session correctly scoped".

**B. QR Mobile Preview — this is a real, correctly scoped driver session.**
After `verifyOtp`, the browser holds the driver's own access token. `auth.uid()` **is the driver's**. Same RPCs, same RLS, same `my_fuel_transactions()` — no management path anywhere in it. The only marker is a local UI flag (`src/lib/previewSession.ts`) for the banner and 60-minute auto sign-out; it grants nothing. Actions taken are real, as the modal itself warns.

So the demonstration the known-debt entry asks for is already possible today — it just has never been run.

## 3. What would actually prove it

Lightest, by a distance: **run the QR preview against Ali Mohamed and compare.** No build, no new account, no credentials. Open the picker, tap the phone icon on Ali, scan (or copy the link into a private browser window — same flow), open My Fuel, and check the figures against the management screen: 3 purchases, $1,960.56 not yet deducted, $0.00 deducted, Unit 260. Then repeat on a second driver to show he sees only his own rows.

Alternatives, weaker or heavier:
- **A permanent test operator with a known password** — `provision-demo-driver` already creates real operator accounts flagged `is_demo`, but with a random password nobody keeps. A password reset on a demo account would give a reusable login. Heavier than the QR, useful only if this check becomes routine.
- **An automated browser test authenticating as an operator** — the strongest, because it re-runs on every change and would catch a regression. Real work, and the sandbox has no driver password to start from; the sensible sequencing is to prove it by hand first, then decide.
- **psql-based checks** — cannot help. They cannot produce an `auth.uid()`, which is the whole question.

## 4. The credentials question

Drivers normally get access by invite: `invite-operator` creates the auth user and sends a set-password link, and `resend-invite` issues a recovery link that functions as "set password". `LoginPage` offers a self-service password reset. All of those go to the **driver's own inbox** — an owner cannot use them without either taking over the driver's mailbox or forcing a password change the driver would then be locked out by. Neither is legitimate.

The QR preview exists precisely to avoid that: it mints a fresh single-use session server-side, for a management/owner caller only, without touching the driver's password, expiring in 3 minutes and audited on both creation and redemption. It is the legitimate route to a working driver session for testing.

One caution worth stating: it is a **real** session, so anything tapped in it is a real action by that driver. For a read-only screen like My Fuel that is fine. Doing it on a demo driver instead of Ali would be safer still, but a demo driver has no fuel rows, so it would not settle the parity question.

## Contradictions with the record

None found. The known-debt entry's own trigger names "preview-as-operator" as an acceptable proof — the QR handoff is that, and it works; the in-app preview, which is what the name most naturally suggests, is not.
