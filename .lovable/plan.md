# Add Birthday & Anniversary Templates to Content Manager

Add two new preview cards in the Content Manager (`EmailCatalog.tsx`) under the **Notifications** category — one for driver birthdays and a separate one for driver work anniversaries — so staff can preview the exact emails the automated job sends.

## What to build

In `src/components/management/EmailCatalog.tsx`, append two entries to the `TEMPLATES` array (category: `notifications`, recipient: `operator`, sender: `SUPERTRANSPORT <support@mysupertransport.com>`):

1. **`driver_birthday`** — "Driver Birthday Greeting"
   - Subject: `Happy Birthday, John! 🎂`
   - Heading: `Happy Birthday, John! 🎂`
   - Body mirrors `send-birthday-anniversary` birthday HTML: warm wish from the SUPERTRANSPORT family, "another great year ahead," signed by "The SUPERTRANSPORT Team."
   - No CTA (matches the automated send).

2. **`driver_anniversary`** — "Driver Work Anniversary"
   - Subject: `Congratulations on 1 year with SUPERTRANSPORT! 🎉`
   - Heading: `Happy Anniversary, John! 🎉`
   - Body mirrors the anniversary HTML: "Today marks 1 year since you became an active operator…", dedication line, "many more miles and milestones," signed by "The SUPERTRANSPORT Team."
   - Uses the existing `SAMPLE_NAME` constant; hard-code `1 year` for the sample preview.
   - No CTA.

Both use the existing `buildEmail()` helper so the preview matches the styling of every other card. No changes needed to categories, tabs, or filter counts — the `notifications` category already exists and count updates automatically.

## Out of scope

- No edits to the `send-birthday-anniversary` edge function or `birthdayAnniversary/templates.ts` — this is preview-only content parity.
- No new database rows, no editable-template plumbing beyond what the catalog already supports.
