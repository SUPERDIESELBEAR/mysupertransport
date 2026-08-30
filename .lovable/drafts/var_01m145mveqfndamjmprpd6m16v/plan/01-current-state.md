# Company name, address & logo on the driver application

## Where branding exists today

| Surface | Logo | Company name | Address / DOT / MC |
|---|---|---|---|
| Online application form (`/apply`) header + confirmation screens | Yes (bundled logo image) | Alt text only | No |
| 4 printable standalone disclosures (FCRA, PSP, DOT drug & alcohol questions, Testing Policy cert) | No | Text wordmark "SUPERTRANSPORT" | No |
| Printed "Submitted Application" snapshot (staff print view) | No | No | No |

So the online form shows the logo, but **nothing an applicant or officer can hold prints with the company identity** — no logo, no legal name block, no address.

## What already exists to build on

- `src/assets/supertransport-logo.png` — the bundled logo, already used on the form and portals.
- A `carrier_profile` singleton record (the system of record for carrier identity) holding: legal name, USDOT #2309365, MC #788425, main office address (605 Madison St, Pleasant Hill, MO 64080), home terminal, timezone. ELD records already snapshot from it.
- A shared print helper (`printDocumentById`) used by the snapshot and the standalone docs.

The gap is purely presentational: the identity data and logo exist; they are just not rendered on the printable application surfaces.
