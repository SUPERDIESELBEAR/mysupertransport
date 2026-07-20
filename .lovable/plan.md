## Plan: Update Stage 7 Insurance Email Labels/Icon

**Scope:** In `src/pages/staff/OperatorDetailPanel.tsx`, within Stage 7 (Insurance), make three UI-only copy/icon changes.

**Changes:**
1. Change the gold-outline send button label from **"Send to Insurance Company"** to **"Email Insurance Company"**.
2. Swap the button icon from `<Mail />` to `<Send />` (paper airplane), matching the Stage 8 "Email Tracey McQuilken" button.
3. Change the section label **"Email Request to Insurer"** to **"Email Request to Insurance Company"**.

**No functional or backend changes.** The `Send` icon is already imported in the file.

**Verification:**
- Search the file to confirm the old strings/icons are replaced.
- Build/typecheck to confirm no import or JSX errors.
- Optionally spot-check the Stage 7 card in the preview to confirm the button label and icon render correctly.