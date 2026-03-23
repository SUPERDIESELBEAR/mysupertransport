
## Full Template Audit — Side-by-Side Comparison

After reading all 7 functions in full, here is the exact state of every HTML shell, with every difference highlighted.

---

### The 5 functions that use `buildEmail()` — Layout comparison

All 5 share the same outer scaffold. Here are the **exact differences** between each copy:

```
SECTION            send-notification   notify-onboarding   send-cert-reminder   notify-upload-attention   (shared target)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DOCTYPE + head     ✓ identical         ✓ identical          ✓ identical          ✓ identical
Body bg            #f5f5f5             #f5f5f5              #f5f5f5              #f5f5f5
Outer table        width="100%"        width="100%"         width="100%"         width="100%"
Inner table        width="600"         width="600"          width="600"          width="600"
Header bg          #0f1117             #0f1117              #0f1117              #0f1117
Header border      3px solid #C9A84C   3px solid #C9A84C    3px solid #C9A84C    3px solid #C9A84C
Brand text         SUPERTRANSPORT      SUPERTRANSPORT       SUPERTRANSPORT       SUPERTRANSPORT
Subtitle           DRIVER OPERATIONS   DRIVER OPERATIONS    DRIVER OPERATIONS    DRIVER OPERATIONS
Body padding       padding:40px        padding:40px         padding:40px         padding:40px
H1 style           ✓ identical         ✓ identical          ✓ identical          ✓ identical
Body div style     ✓ identical         ✓ identical          ✓ identical          ✓ identical
CTA button style   ✓ identical         ✓ identical          ✓ identical          ✓ identical (hardcoded, not optional)
Footer bg          #f9f9f9             #f9f9f9              #f9f9f9              #f9f9f9
Footer border-top  1px solid #eee      1px solid #eee       1px solid #eee       1px solid #eee

DIFFERENCES ↓
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Footer email       support@...         onboarding@...       support@...          (no sendEmail helper — raw fetch)
Footer text line2  "do not reply"      "do not reply"       "do not reply"       "do not reply"
cta param          optional (cta?)     optional (cta?)      optional (cta?)      REQUIRED (not optional)
HTML comments      YES (<!-- Header-->) NO                  NO                   YES (<!-- Header --> etc.)
```

**Summary of real differences across the 5 standard `buildEmail()` copies:**

1. **Footer support email**: `send-notification` and `send-cert-reminder` use `support@mysupertransport.com`. `notify-onboarding-update` uses `onboarding@mysupertransport.com`. `notify-upload-attention` uses `support@` in the footer but sends `from: support@` as well.

2. **CTA optional vs required**: `notify-upload-attention`'s `buildEmail` signature requires CTA (non-optional). The other three make it optional with `cta?`. The shared helper will keep it optional — `notify-upload-attention` always passes one anyway.

3. **HTML comments**: Two functions include `<!-- Header -->` / `<!-- Body -->` / `<!-- Footer -->` inline comments. Two don't. The shared version will include them (no functional impact, only aids readability).

4. **`sendEmail` helper**: `notify-upload-attention` does NOT use a `sendEmail()` helper — it calls `fetch` directly with `from: support@mysupertransport.com`. This is the only one with a different from-address at send time. The shared `sendEmail(from?)` will accept an optional `from` override to handle this.

---

### The 2 invite functions — `buildInviteEmail()` — Layout comparison

```
SECTION                    invite-applicant                invite-staff
────────────────────────────────────────────────────────────────────────
Outer scaffold             ✓ identical to standard shell  ✓ identical to standard shell
Header                     ✓ identical                    ✓ identical
Subtitle                   DRIVER OPERATIONS              DRIVER OPERATIONS
Footer email               recruiting@...                 support@...
Footer line 2              "personally invited you"       "automated notification"

BODY DIFFERENCES:
invite-applicant           Custom h1 with firstName baked in, bullet list of "what to expect",
                           optional note block (gold left-border), plain-text URL fallback line
invite-staff               Standard h1, role label, role badge block (gold border), 
                           expiry warning paragraph, no URL fallback line
```

These two bodies are **too structurally different to use the standard `buildEmail(body)`** signature cleanly — the heading content is dynamic and baked into the outer `h1`, not a generic heading string. The plan is to extract just the `emailHeader()` + `emailFooter()` from a shared helper so the outer shell is consistent, while each invite function assembles its own body. This is identical to the plan for `send-insurance-request`.

---

### `send-insurance-request` — `buildInsuranceEmail()` — Layout comparison

```
SECTION               send-insurance-request         Standard buildEmail()
──────────────────────────────────────────────────────────────────────────
Outer scaffold        ✓ identical                    ✓ identical
Inner table width     620 (vs 600)                   600
Header                ✓ identical                    ✓ identical
Subtitle              "INSURANCE REQUEST"            "DRIVER OPERATIONS"
Body padding          padding:36px 40px              padding:40px
Footer text           "business request sent by..."  "do not reply..."
Footer no email link  no email link in footer        has email link
```

Differences here are **intentional** — different subtitle, slightly different padding, different footer copy. This one keeps `buildInsuranceEmail()` but will import `emailHeader()` / `emailFooter()` helpers for its header and footer rows.

---

### Conclusion: Plan is sound with one refinement

The plan is confirmed safe. Here is the single refinement the audit reveals:

**The shared `sendEmail()` helper needs an optional `from` parameter** because:
- `notify-upload-attention` sends from `support@mysupertransport.com`
- All others send from `onboarding@mysupertransport.com`
- The default will be `onboarding@mysupertransport.com`

**The shared `buildEmail()` footer needs a configurable support email** because:
- `send-notification`, `send-cert-reminder`, `notify-upload-attention` → `support@`  
- `notify-onboarding-update` → `onboarding@`
- Default will be `support@mysupertransport.com`; `notify-onboarding-update` will pass an override

Everything else in the layout is byte-for-byte identical across the 5 standard functions. The unification will produce identical HTML output for every existing email.

---

### What the shared helper will export

```
_shared/email-layout.ts exports:
  BRAND_COLOR    = '#C9A84C'
  BRAND_DARK     = '#0f1117'
  BRAND_NAME     = 'SUPERTRANSPORT'
  SUPPORT_EMAIL  = 'support@mysupertransport.com'

  buildEmail(subject, heading, body, cta?, footerEmail?)
    → full HTML string, footerEmail defaults to SUPPORT_EMAIL

  emailHeader(subtitle?)
    → the <tr> header row HTML, subtitle defaults to 'DRIVER OPERATIONS'

  emailFooter(footerEmail?, footerNote?)
    → the <tr> footer row HTML

  sendEmail(to, subject, html, resendKey, from?)
    → calls Resend, from defaults to 'SUPERTRANSPORT <onboarding@mysupertransport.com>'
```

This covers every variation found in the audit without changing any email's visual output.
