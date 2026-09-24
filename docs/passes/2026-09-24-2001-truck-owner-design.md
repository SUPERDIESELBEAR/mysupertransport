# Pass — truck owners with several trucks, and owners who also drive (2026-09-24 20:01 UTC)

Mode: BUILD, read-only investigation and design. No migrations, no code, no data
changed. Files authored: this report, `docs/tms-build-status.md` (dated entry),
`docs/tms-wish-list.md`. **Full suite skipped — docs-only pass.**

Prompt arrived whole (last line: "END OF PROMPT. If this line is not the last
thing you received, STOP…").

## Contradiction check — one finding, not a stop

The prompt frames owner-and-driver as a future case. **It already exists in live
data:** three logins hold BOTH `operator` and `truck_owner` today, all at
SUPERTRANSPORT, each owning a truck driven by someone else:

| Owner (own operator row) | Owns the truck driven by | Own operator active |
|---|---|---|
| David Mitchell (189d5ff3…) | Kevin Foy | yes |
| Jonathan Grant (396c1e54…) | Steven Moore | yes |
| Shawn Bresett (486a8358…) | Shawn Bresett Jr | no |

They were linked before the refusal at invite-truck-owner:82-99 was added. This
matches the business model rather than contradicting it, so the pass continued.
It does mean (b) is a live defect, not a design question — see Step 3(b).

## Step 1 — Michael's case, live

- **Michael Underwood**: login `0a5482d5…`, roles `operator` only, no
  `company_members` row (correct for a driver). Approved application `dc889b92…`
  (Umike5663@gmail.com). Operator row `ab70c682…`, active, SUPERTRANSPORT. His
  own ICA is `fully_executed`, signed by himself (no truck owner on his unit).
  No `truck_owners` row.
- **Kirt Frazer**: login `abb4bc34…`, roles `operator` only. Approved application
  `1662d7c3…`. Operator row `b6181f65…`, active, SUPERTRANSPORT. **No ICA
  contract yet.** No `truck_owners` row.
- **Why it refused:** Michael's email matches an existing login, and that login
  holds `operator`. Lines 85-99 refuse any existing login holding operator,
  applicant, dispatcher, management, onboarding_staff or owner — no distinction
  between "a driver at this carrier" and "staff" or "someone at another carrier".
- **What should happen:** Michael is an owner who drives one of his own trucks
  and hires Kirt for another. The invite should LINK his existing login as
  owner of Kirt's unit (add `truck_owner` role, create the owner link), send no
  new-account email, and route Kirt's ICA to Michael for signature. Michael keeps
  his own driver app for his own truck and gains an owner view of Kirt's unit.
- **Even if the refusal were lifted today, it would half-work** (the three live
  cases prove it): `truck_owners.user_id` is UNIQUE, so Michael could own only
  one truck; and his portal would switch to Kirt's data and hide his own
  (Step 3b).

## Step 2 — what exists today

| Capability | Works today | How | Gap |
|---|---|---|---|
| Owner record | Yes, 1:1 | `truck_owners` (18 cols, company_id NOT NULL); UNIQUE(operator_id), UNIQUE(user_id); 6 rows, 5 with a login | One login → at most one truck |
| Owner → driver check | Yes | `is_truck_owner_for_operator(uid, op)` = row with that user_id AND operator_id | Fine for many-to-many if uniqueness relaxed |
| Policies using it | 16 on public + 2 storage | SELECT on operators, onboarding_status, operator_documents, driver_vault_documents, ica_contracts, ica_driver_acknowledgments, active_dispatch, dispatch_daily_log, contractor_pay_setup, truck_dot_inspections, truck_maintenance_records, equipment_assignments; UPDATE ica_contracts (sign), UPDATE onboarding_status (decals); INSERT operator_documents; storage contractor signature upload/view; drivers can view their truck owner | No inspection binder, no settlements, no loads, no fuel |
| Owner portal | Partly | No separate route: `truck_owner` renders `OperatorPortal`; it looks up the owner's single row (`.maybeSingle()`) and swaps `effectiveUserId` to the driver's | One truck only; replaces the owner's own driver data |
| Owner signs ICA | Yes, single truck | `OperatorICASign` resolves the truck-owner row FIRST, signer = owner; driver read-only; auto-filed to the driver's binder (Aug plan) | `.maybeSingle()` errors with two rows; an owner-driver can never reach his OWN ICA |
| Owner sees driver's docs | Partly | Vault, operator documents, ICA, DOT inspections, maintenance via policies | `inspection_documents` (DOT binder, per-driver) has NO owner policy — the auto-filed ICA in the binder is invisible to him |
| Settlements reach owner | No | `settlements` keyed by `operator_id`; read policy = the driver's own login only | Settlement goes to the driver's view, not the owner's |
| Invite | Partly | `invite-truck-owner` upserts on `operator_id` | Refuses every existing driver login |

## Step 3 — gaps against the business model

- **(a) Several trucks, several drivers:** blocked by `truck_owners_user_id_key`;
  the portal and ICA screen assume one row.
- **(b) Owner who also drives:** tenancy works (below), but the portal sets
  `effectiveUserId` to the owned driver whenever `isTruckOwner` — David Mitchell
  and Jonathan Grant, both active drivers, today see Kevin's and Steven's
  loads/documents instead of their own, and the ICA screen resolves them as
  signer of the other unit, never their own. Live defect for two people.
- **(c) Owner signs from his own login:** works for exactly one truck.
- **(d) Owner sees every roadside document of each driver:** vault and ICA yes,
  inspection binder no; per-truck only. Drivers keep their own app unchanged —
  nothing in the owner design touches the driver's own access.
- **(e) Settlements across all his trucks:** not built. Pay is per operator; no
  owner-facing read, no payee field.

## Step 4 — rules this touches

- `operators_user_id_key` UNIQUE(user_id): correct and **stays** — a person
  drives one truck. The owner-driver's own truck is his own `operators` row.
- `truck_owners_user_id_key` UNIQUE(user_id): the one rule that must change.
- `truck_owners_operator_id_key` UNIQUE(operator_id): correct and **stays** — a
  truck has one owner.
- `current_company_id()`: unions company_members ∪ own operators ∪ own
  truck_owners, returns the company only if exactly one DISTINCT value. A login
  that is operator and truck owner at the SAME carrier yields one distinct
  company → resolves. Confirmed by the definition and by the three live
  owner-drivers (all SUPERTRANSPORT). Several `truck_owners` rows at the same
  carrier also still resolve (UNION de-duplicates). Rows at two carriers → NULL,
  which is what the record's one-carrier assumption wants.
- **Who signs the ICA:** `ica_contracts` carries one contractor signature
  (`contractor_signed_at/_signature_url/_typed_name`) plus `owner_*` identity
  fields and the carrier signature. The Aug single-signer plan
  (`mem://features/ica-management/single-signer-routing`) made the truck owner
  the sole contractor signer when a unit has an owner; the hired driver signs
  nothing and gets no acknowledgment step. So today: the owner as lessor signs;
  the driver does not.

## Step 5 — proposal (not built)

**Shape — smallest change:** keep `truck_owners` as the per-truck link
(one row per owned unit) and drop only `truck_owners_user_id_key`, replacing it
with UNIQUE(user_id, operator_id) (already implied by UNIQUE(operator_id)).
Per-person identity fields (name, business, EIN, address) duplicate across his
rows. Alternative — a separate `truck_owner_accounts` record plus a link table —
is cleaner but a bigger migration touching all 18 policies; recommend it only if
the owner wants owner-level data (payee, 1099 address) held once. Existing 6
rows stay as-is under either shape; no data move for the small change.

**Invite rule:** existing login →
- staff role (dispatcher/management/onboarding_staff/owner) → refuse;
- operator/applicant at ANOTHER carrier → refuse;
- operator at the SAME carrier, or existing truck owner at the same carrier →
  link: add the role if missing, insert the `truck_owners` row, no account email,
  send the "ICA ready to sign" notice;
- the email of the driver of this very unit → refuse (a driver cannot be his own
  hired driver's owner; he is an owner-operator with no owner row).

**Passes, each with its proof:**
1. **Portal fix for owner-drivers (live defect, first).** Owner-driver sees his
   own driver app by default, plus a "My trucks" switcher; pure owner lands on
   the switcher. Proof: David Mitchell's login sees his own loads/documents;
   switching shows Kevin's; Kevin sees only his own.
2. **Many trucks.** Migration: drop `truck_owners_user_id_key`, add
   UNIQUE(user_id, operator_id); ICA screen and portal take the chosen unit
   instead of `.maybeSingle()`. Proof (raising transaction): one owner linked to
   two throwaway units resolves to the carrier, signs each unit's ICA, sees both
   drivers and neither sees the other.
3. **Invite links, not refuses.** Edge function change per the rule above.
   Proof: Michael linked to Kirt's unit without a new account email; a staff
   email and a scratch-carrier driver email refused; zero residue for throwaways.
4. **Binder visibility.** Owner SELECT policy on per-driver
   `inspection_documents` via `is_truck_owner_for_operator`. Proof: owner sees
   each driver's binder incl. the auto-filed ICA; a non-owned driver's binder: 0.
5. **Owner settlements.** Read policy on settlements/line items for the owner of
   the operator, plus an owner "all my trucks" view — belongs inside the Alvys
   settlements milestone. Proof: owner sees each truck's settlement; hired driver
   still sees his own per P56 (if the owner allows — decision below).

## Owner decisions owed

1. Small change (drop the one uniqueness rule) or a separate owner-account
   record? Recommendation: small change now.
2. Should a hired driver see his truck's settlement at all, given settlements go
   to the owner who pays him? P56 says drivers view settlements in the app.
3. Owner-driver: one combined ICA or one per truck? (Assumed: one per truck,
   as today.)
4. May a truck owner see a hired driver's loads and fuel (record 2026-09-15 left
   this open)?
5. Michael now: link him after pass 3, or record his ownership by hand by staff
   after pass 2? Kirt has no ICA yet, so nothing is blocked beyond that.
