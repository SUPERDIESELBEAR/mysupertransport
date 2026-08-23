import { describe, expect, it } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";
import { LEGACY_PUBLIC_ONLY_PINS } from "./helpers/legacyPublicOnlyPins";

/**
 * DATABASE-BACKED SECURITY DEFINER GUARD -- THIS FILE IS THE AUTHORITY.
 *
 * definer-search-path.test.ts and definer-fail-open.test.ts read migration
 * files. This one reads pg_proc. The distinction is not academic: on
 * 2026-08-01 four SECURITY DEFINER functions were live in this database with
 * no search_path pin and anon EXECUTE, while every migration file on disk
 * read correct. One of them, read_email_batch, returned rendered email bodies
 * containing magic links to any unauthenticated caller. The file-based guards
 * were green throughout, because the grants were made out of band and a
 * migration-file check has no way to see that.
 *
 * See docs/eld-mail-queue-acl-2026-08-01.md for the full record.
 *
 * WHEN THIS FILE SKIPS, IT SAYS SO LOUDLY.
 * A guard that quietly no-ops without a database is worse than no guard,
 * because the green check reads as a pass. Absence of PGHOST prints a banner.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("definer-live-catalog.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST in the environment, so the live pg_proc catalog could not be",
    "read. The SECURITY DEFINER pin and anon-EXECUTE checks are the",
    "authoritative ones, and the only checks that can see grants made outside",
    "the migration files. A green run WITHOUT them is not evidence the",
    "database is clean. Each one is registered below as a named skip so its",
    "non-execution is counted, and each fails under CI.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live pg_proc catalog could not be read",
  details: [
    "These are the only checks that see grants made outside the migration files.",
  ],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Functions that are SECURITY DEFINER and executable by the `anon` role,
 * as of the 2026-08-01 inventory.
 *
 * This list is a RECORD OF WHAT WAS ALREADY TRUE, not an endorsement. Some
 * entries are deliberate: token-gated public endpoints that an unauthenticated
 * applicant must reach (application drafts, PEI responses, short links). Some
 * are near-certainly wrong and simply have not been triaged yet -- each needs
 * its body read before its grant is touched, and revoking in bulk without
 * that reading would break real endpoints.
 *
 * The point of pinning the list here is that it cannot GROW quietly. A new
 * anon-executable definer function fails this test on the next run, whether it
 * arrived via a migration or via an out-of-band grant.
 *
 * Tracked as open register #6. Entries come off as they are triaged.
 */
const KNOWN_ANON_EXECUTABLE: readonly string[] = [
  "public._audit_actor_name(uuid)",
  "public.add_pei_staff_note(uuid,text)",
  "public.approve_application_correction(text,text,text,jsonb)",
  "public.archive_applicant_pei(uuid,text,text)",
  "public.archive_applicant_pei(uuid,text)",
  "public.can_driver_message_staff(uuid,uuid)",
  "public.cancel_application_correction(uuid)",
  "public.check_application_email_taken(text)",
  "public.consume_application_resume_token(text)",
  "public.email_queue_dispatch()",
  "public.get_application_by_draft_token(uuid)",
  "public.get_application_correction_by_token(text)",
  "public.get_application_pei_summary(uuid)",
  "public.get_equipment_shipping_for_operator(uuid)",
  "public.get_inspection_doc_by_token(uuid)",
  "public.get_or_create_short_link(text)",
  "public.get_pei_request_for_response(uuid)",
  "public.get_pei_requests_needing_action()",
  "public.get_thread_participants(uuid)",
  "public.get_user_roles(uuid)",
  "public.has_role(uuid,app_role)",
  "public.is_own_rods_operator(uuid)",
  "public.is_staff(uuid)",
  "public.is_thread_participant(uuid,uuid)",
  "public.is_truck_owner_for_operator(uuid,uuid)",
  "public.is_valid_application_draft_token(text)",
  "public.list_driver_contacts(uuid)",
  "public.list_my_group_threads()",
  "public.list_staff_auto_assigned_drivers(uuid)",
  "public.log_pei_manual_send(uuid,timestamp with time zone,text,text)",
  "public.log_pei_phone_attempt(uuid,timestamp with time zone,text,text)",
  "public.mark_thread_read(uuid)",
  "public.move_revisions_to_pending(uuid)",
  "public.operator_awaiting_return(uuid)",
  "public.operator_return_requested(uuid)",
  "public.reject_application_correction(text,text,jsonb)",
  "public.resolve_share_token(uuid)",
  "public.resolve_short_link(text)",
  "public.restore_applicant_pei(uuid)",
  "public.save_application_draft(uuid,jsonb)",
  "public.submit_application_correction(uuid,text,text,jsonb)",
  "public.submit_application_draft(uuid,jsonb,text)",
  "public.submit_pei_response(uuid,jsonb,jsonb,jsonb)",
  "public.submit_pei_response(uuid,jsonb,jsonb)",
  "public.unacked_go_live_blockers(uuid)",
  // Token-gated public endpoints, verified 2026-08-20 by reading each body.
  // get_ica_review_link: /ica-review/:token (IcaReview.tsx). Looks the token up
  // in ica_review_links and returns {valid:false} when missing, revoked, or
  // expired; exposes only recipient name, note, and expiry — no financial data.
  "public.get_ica_review_link(text)",
  // get_share_bundle_meta / resolve_share_bundle: /binder-share/:token
  // (BinderShareBundlePage.tsx). Both filter on the bundle token AND
  // expires_at > now(), and return nothing at all when either fails.
  "public.get_share_bundle_meta(uuid)",
  "public.resolve_share_bundle(uuid)",
];

/**
 * Asserted, not advisory. Adding an entry to the list above requires editing
 * this number in the same diff -- a deliberate act, rather than a quiet append
 * while chasing a red test.
 */
// 58 minus the four whose creating-migration REVOKE the platform re-grant had
// undone (discard_rods_amendment, log_ica_event, match_staff_help_knowledge,
// revoke_share_token), re-asserted 2026-08-03 and re-read live.
// 54 + the three token-gated public endpoints registered 2026-08-20
// (get_ica_review_link, get_share_bundle_meta, resolve_share_bundle), minus the
// seven entries no longer anon-executable, removed in the same 2026-08-20 pass.
const KNOWN_ANON_EXECUTABLE_MAX = 50;


/**
 * Callable (non-trigger) SECURITY DEFINER functions executable by
 * `authenticated`, as of the 2026-08-01 inventory. 64 of them; 63 overlap
 * with KNOWN_ANON_EXECUTABLE, the rest are signed-in-only.
 *
 * Same contract as the anon list: it may shrink, never grow quietly. This is
 * the list that accounts for linter rule 0028's `authenticated` half, so that
 * no residual warning is left untracked.
 */
const KNOWN_AUTHENTICATED_EXECUTABLE: readonly string[] = [
  "public._audit_actor_name(uuid)",
  "public.acknowledge_eld_sync_alert(uuid)",
  "public.add_pei_staff_note(uuid,text)",
  "public.approve_application_correction(text,text,text,jsonb)",
  "public.archive_applicant_pei(uuid,text,text)",
  "public.archive_applicant_pei(uuid,text)",
  "public.assign_user_role(uuid,app_role)",
  "public.can_driver_message_staff(uuid,uuid)",
  "public.cancel_application_correction(uuid)",
  "public.check_application_email_taken(text)",
  "public.consume_application_resume_token(text)",
  // create_eld_document_day / replace_rods_document used to be pinned here.
  // The HEIC migration replaced both signatures and, in doing so, dropped the
  // anon EXECUTE grant. Verified live 2026-08-01: anon has no EXECUTE on
  // either new signature. Entries removed rather than re-signatured — this
  // list is only ever allowed to shrink.
  "public.count_unused_resume_tokens(uuid)",
  // INTERIM PAIR. The eight-argument form is the live one; the seven-argument
  // form is kept only so certify entries already queued on drivers' phones --
  // some offline for days -- keep resolving across the deploy gap. Dropping it
  // with the client deploy would fail those calls as `server`, burning their
  // attempt budget instead of waiting. Removal trigger and the drop statement
  // are in docs/deferred-removals.md.
  "public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb)",
  "public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb,jsonb)",
  // HEIC path: both gained p_display_document_path / p_display_conversion_failed.
  // Definer because they enforce the record_source and source_document_path
  // guards that a direct table write would bypass; a driver may only reach
  // their own operator row through them.
  "public.create_eld_document_day(uuid,date,text,jsonb,uuid,text,boolean)",
  "public.discard_rods_amendment(uuid)",
  "public.email_queue_dispatch()",
  "public.get_application_by_draft_token(uuid)",
  "public.get_application_correction_by_token(text)",
  "public.get_application_pei_summary(uuid)",
  "public.get_equipment_shipping_for_operator(uuid)",
  "public.get_inspection_doc_by_token(uuid)",
  "public.get_or_create_short_link(text)",
  "public.get_pei_queue()",
  "public.get_pei_request_for_response(uuid)",
  "public.get_pei_requests_needing_action()",
  "public.get_staff_contact_info(uuid[])",
  "public.get_thread_participants(uuid)",
  "public.get_user_roles(uuid)",
  "public.has_role(uuid,app_role)",
  "public.is_own_rods_operator(uuid)",
  "public.is_staff(uuid)",
  "public.is_thread_participant(uuid,uuid)",
  "public.is_truck_owner_for_operator(uuid,uuid)",
  "public.is_valid_application_draft_token(text)",
  "public.list_driver_contacts(uuid)",
  "public.list_my_group_threads()",
  "public.list_staff_auto_assigned_drivers(uuid)",
  "public.log_ica_event(text,uuid,uuid,jsonb)",
  "public.log_pei_manual_send(uuid,timestamp with time zone,text,text)",
  "public.log_pei_phone_attempt(uuid,timestamp with time zone,text,text)",
  "public.mark_operator_seen(boolean)",
  "public.mark_thread_read(uuid)",
  "public.match_staff_help_knowledge(vector,integer,double precision)",
  "public.move_revisions_to_pending(uuid)",
  "public.operator_awaiting_return(uuid)",
  "public.operator_return_requested(uuid)",
  "public.raise_eld_sync_alert(uuid,text,date,text)",
  "public.record_rods_unlock(uuid,uuid,date,timestamp with time zone,timestamp with time zone,jsonb,jsonb,text,text,uuid)",
  "public.reject_application_correction(text,text,jsonb)",
  "public.remove_user_role(uuid,app_role)",
  "public.replace_rods_document(uuid,text,text,uuid,text,boolean)",
  "public.resolve_share_token(uuid)",
  "public.resolve_short_link(text)",
  "public.restore_applicant_pei(uuid)",
  "public.revoke_share_token(uuid)",
  "public.save_application_draft(uuid,jsonb)",
  "public.search_audit_log(text,text,timestamp with time zone,timestamp with time zone,integer,integer,uuid,uuid)",
  "public.search_audit_log(text,text,timestamp with time zone,timestamp with time zone,integer,integer)",
  "public.set_go_live_with_override(uuid,date,text)",
  "public.submit_application_correction(uuid,text,text,jsonb)",
  "public.submit_application_draft(uuid,jsonb,text)",
  "public.submit_pei_response(uuid,jsonb,jsonb,jsonb)",
  "public.submit_pei_response(uuid,jsonb,jsonb)",
  "public.unacked_go_live_blockers(uuid)",
  "public.update_pei_archive_category(uuid,text,text)",
  // Read by the ELD management console via supabase.rpc. Every row it returns
  // is gated on public.is_staff(auth.uid()) inside the body, so the grant to
  // `authenticated` is the intended surface; it is NOT granted to anon.
  "public.get_eld_escalation_ledger(uuid)",
  // The §6 retention archive RPCs. `export-retention-archive` deliberately
  // builds a USER-SCOPED client for these three, because each one gates on
  // is_retention_admin(auth.uid()) in its body — under the service-role client
  // requireStaff returns, auth.uid() is null and the gate silently reads
  // false. So `authenticated` must hold EXECUTE; anon does not.
  "public.get_eld_compliance_timeline(uuid)",
  "public.search_retention_archive(uuid[],date,date,text,uuid,text,boolean)",
  "public.record_retention_export(text,uuid[],date,date,boolean,integer,integer,text,jsonb)",
  // §7 revoked-list verification. Called from the management console via
  // supabase.rpc under the signed-in staff member, and gates on
  // has_role(auth.uid(), 'management'|'owner') in its body — so the check is
  // attributed to a real person. Granted to `authenticated`, never anon.
  "public.record_revoked_list_check(uuid,text,date,text,date,date)",
  // §8 server-side divergence resolution. record_ is the driver write path and
  // gates on is_own_rods_operator; acknowledge_ admits staff for anyone and a
  // driver for his own row only. Both are called by signed-in users from the
  // phone and the console, never anon.
  "public.record_rods_divergence(uuid,date,uuid,uuid,text[],jsonb,jsonb,timestamp with time zone,text,text)",
  "public.acknowledge_rods_divergence(uuid,text)",
  // Load management RPCs (TMS). All are called with supabase.rpc from the
  // staff console under the signed-in user, and every one re-checks the
  // caller's role in its own body — anon EXECUTE is revoked on each.
  // has_role management|owner|dispatcher; management alone may override a
  // blocking eligibility failure.
  "public.assign_load_driver(uuid,uuid,text)",
  // has_role management|owner|dispatcher; requires a written reason.
  "public.unassign_load_driver(uuid,text)",
  // has_role management|owner|dispatcher; billing statuses management|owner only.
  "public.update_load_status(uuid,load_status,text)",
  // has_role management|owner|dispatcher.
  "public.create_load_with_stops(jsonb,jsonb,jsonb)",
  // has_role management|owner|dispatcher; financial fields on billed loads are
  // owner-only and every change is written to load_change_history.
  "public.update_load_with_stops(uuid,jsonb,jsonb,jsonb,text,text,boolean)",
  // has_role management|owner|dispatcher; read-only eligibility evaluation.
  "public.check_driver_eligibility(uuid)",
  "public.check_driver_eligibility_bulk(uuid[])",
  // has_role management|owner|dispatcher; advances the shared load counter.
  "public.generate_load_number()",
  // has_role management|owner|dispatcher to raise/resolve; reopen is
  // management|owner only.
  "public.manage_claim_flag(text,uuid,uuid,claim_flag_level,claim_type,text,text,numeric,text,text,text,numeric,text)",
  // has_role management|owner|dispatcher; writes the paired duplicate-broker-
  // reference notes to load_change_history on both loads. No other effect.
  "public.record_duplicate_broker_reference(uuid,uuid,text)",
  // has_role management|owner|dispatcher; files a document's references, their
  // stop citations and the baseline provenance entry in ONE transaction, with
  // the actor resolved by current_profile_id(). Replaces
  // record_load_reference_baseline, whose split write left half-filed
  // baselines. No financial effect.
  "public.file_load_references(uuid,jsonb,text,uuid,text,text)",
  // has_role management|owner|dispatcher; marks one parser diagnostic resolved
  // and stamps the resolver's profile id. Two columns on one row.
  "public.resolve_parser_diagnostic(uuid)",
  // has_role management|owner|dispatcher|onboarding_staff; stores the verdicts
  // for this load's verbatim captures. Writes one jsonb column, nothing else.
  "public.set_load_verbatim_verification(uuid,jsonb)",

  // Token-gated public endpoints that also hold the authenticated grant; see
  // the KNOWN_ANON_EXECUTABLE entries above for the gate each one enforces.
  "public.get_ica_review_link(text)",
  "public.get_share_bundle_meta(uuid)",
  "public.resolve_share_bundle(uuid)",
];

// 65 + the interim certify_rods_day overload + get_eld_escalation_ledger
// + the three §6 retention RPCs + the §7 revoked-list recorder
// + the two §8 divergence RPCs. Goes back to
// 70 when the seven-argument certify form is dropped
// (docs/deferred-removals.md).
// + the eight load-management RPCs and the three token-gated public
// endpoints registered 2026-08-20, plus update_load_with_stops and
// record_duplicate_broker_reference.
// + set_load_verbatim_verification, then file_load_references and
// resolve_parser_diagnostic (record_load_reference_baseline dropped).
const KNOWN_AUTHENTICATED_EXECUTABLE_MAX = 89;


/**
 * The entries appearing more than once, by name. A bare count mismatch on a
 * sixty-entry list is not something anyone wants to diff by eye.
 */
function duplicatesIn(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const entry of list) {
    if (seen.has(entry)) dupes.add(entry);
    seen.add(entry);
  }
  return [...dupes].sort();
}

/**
 * Live SECURITY DEFINER functions pinned to `public` alone that exist in NO
 * migration file, so definer-search-path.test.ts cannot see them and its
 * allowlist cannot cover them.
 *
 * WHAT AN ENTRY HERE MEANS. Not merely "public-only pin" — that is the
 * low-severity defect the other allowlist tracks. It means an object that is
 * in the database and in none of our migrations: created, altered, or granted
 * OUT OF BAND. That fact is the thing to explain before exempting it, because
 * it is the same shape as the 2026-08-01 incident. `handle_new_user()` has a
 * reason — it is Supabase's own auth hook, which our migration set does not
 * author. The next one may not. "It showed up live" is not a justification.
 *
 * THIS LIST MAY ONLY SHRINK, same ratchet as everything else here: it is a
 * list of exemptions, so it has that property whether or not it is stated,
 * and without a checked-in maximum the next out-of-band public-only function
 * can be quietly appended during a red-test fix rather than investigated.
 */
const LIVE_ONLY_PUBLIC_PINS: readonly string[] = [
  "public.handle_new_user()",
];

const LIVE_ONLY_PUBLIC_PINS_MAX = 1;

/*
 * THE OUT-OF-BAND INVENTORY, as of 2026-08-02.
 *
 * Five SECURITY DEFINER functions are live in `public` and appear in no
 * migration. Recorded so the next diff between the two guards is a known
 * delta rather than a surprise:
 *
 *   email_queue_dispatch()               search_path=""            compliant
 *   email_queue_wake()                   search_path=""            compliant
 *   handle_new_user()                    search_path=public        exempt below
 *   resolve_officer_packet_token(uuid)   search_path=public, extensions
 *   resolve_share_token(uuid)            search_path=public, extensions
 *
 * The empty-string pin on the two email_queue_* functions is STRONGER than
 * `public, extensions`, not weaker: nothing resolves unqualified. The check
 * below must therefore match on "the pin contains public and not extensions",
 * never on "the pin lacks extensions", which would sweep these in.
 */

/** `public.has_role(uuid,app_role)` and `public.has_role(uuid, public.app_role)` compare equal. */
function normalizeSignature(sig: string): string {
  const lower = sig.trim().toLowerCase();
  const open = lower.indexOf("(");
  if (open === -1) return lower;
  const name = lower.slice(0, open);
  const args = lower.slice(open + 1, lower.lastIndexOf(")"));
  const parts = args
    .split(",")
    .map((a) => a.trim().replace(/^public\./, ""))
    .filter(Boolean);
  return `${name}(${parts.join(",")})`;
}

describe("live SECURITY DEFINER catalog (pg_proc)", () => {
  it("the live-only public-pin exemption list may only shrink", () => {
    expect(
      LIVE_ONLY_PUBLIC_PINS.length,
      `LIVE_ONLY_PUBLIC_PINS has ${LIVE_ONLY_PUBLIC_PINS.length} entries but ` +
        `LIVE_ONLY_PUBLIC_PINS_MAX is ${LIVE_ONLY_PUBLIC_PINS_MAX}. Growing it ` +
        `means exempting another object that exists outside the migration set — ` +
        `explain that first.`,
    ).toBeLessThanOrEqual(LIVE_ONLY_PUBLIC_PINS_MAX);
    expect(
      duplicatesIn(LIVE_ONLY_PUBLIC_PINS),
      "duplicate entries in LIVE_ONLY_PUBLIC_PINS",
    ).toEqual([]);
  });

  itLive(
    "every live public-only pin is accounted for by the file-based guard",
    () => {
      // WHY THIS EXISTS. The check below it asserts only the absence of a pin.
      // Nothing asserted anything about public-ONLY pins live, which is how the
      // file guard and this one could drift apart silently: the file guard's
      // allowlist could shrink because a function was repinned, or because the
      // resolver stopped seeing it, and both read identical from here.
      //
      // Reconciled 2026-08-02: 139 signatures shared, zero class
      // disagreements. This test is what keeps that a checked property.
      const livePublicOnly = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c
            WHERE c LIKE 'search_path=%'
              AND c ~ '(^|[=,[:space:]])public([,[:space:]]|$)'
              AND c !~ 'extensions'
          )
        ORDER BY 1;
      `);

      // Meta-assertion: a query that matches nothing would make this test pass
      // by describing an empty world. There are known public-only pins.
      expect(
        livePublicOnly.length,
        "found zero live public-only pins — the query stopped matching, " +
          "it did not become true",
      ).toBeGreaterThan(0);

      const accounted = new Set([
        ...LEGACY_PUBLIC_ONLY_PINS.map((e) =>
          normalizeSignature(e.slice(e.indexOf("::") + 2)),
        ),
        ...LIVE_ONLY_PUBLIC_PINS.map(normalizeSignature),
      ]);

      const unaccounted = livePublicOnly.filter(
        (sig) => !accounted.has(normalizeSignature(sig)),
      );

      expect(
        unaccounted,
        `Live SECURITY DEFINER functions pinned to "public" alone that neither ` +
          `guard knows about. Either the function is in a migration and the file ` +
          `guard's resolver is not seeing it — which means that guard is ` +
          `describing a database that does not exist — or the object was created ` +
          `out of band, in which case find out by whom before adding it to ` +
          `LIVE_ONLY_PUBLIC_PINS:\n  ${unaccounted.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  it("the allowlist may only shrink", () => {
    expect(KNOWN_ANON_EXECUTABLE.length).toBeLessThanOrEqual(
      KNOWN_ANON_EXECUTABLE_MAX,
    );
    // Distinctness is what makes the MAX above mean anything. A duplicate
    // grows `length` without growing the set the number is supposed to cap,
    // so the ratchet reads one looser than it looks and the next person sizes
    // the MAX to the inflated count. This happened: certify_rods_day's
    // seven-argument form was listed twice (see the run doc).
    expect(
      duplicatesIn(KNOWN_ANON_EXECUTABLE),
      "duplicate entries in KNOWN_ANON_EXECUTABLE",
    ).toEqual([]);
  });

  itLive(
    "every SECURITY DEFINER function in public pins search_path",
    () => {
      const unpinned = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND (
            p.proconfig IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
            )
          )
        ORDER BY 1;
      `);

      // An unpinned definer inherits the caller's search_path. A caller who can
      // create objects in a schema earlier on that path can shadow any
      // unqualified name in the body and have it run as the function owner.
      expect(
        unpinned,
        `SECURITY DEFINER functions with NO search_path pin (privilege ` +
          `escalation shape). Add "SET search_path = public, extensions" ` +
          `and ship it as a migration:\n  ${unpinned.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  itLive(
    "no trigger function is executable by anon or authenticated",
    () => {
      const reachable = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prorettype = 'trigger'::regtype
          AND (
            has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          )
        ORDER BY 1;
      `);

      // Closed in full on 2026-08-01 (51 functions). There is no legitimate
      // reason for a client role to hold EXECUTE on a trigger function:
      // PostgreSQL checks that privilege at CREATE TRIGGER time, not when the
      // trigger fires, so revoking costs nothing. Any entry here means a
      // blanket GRANT ... ON ALL FUNCTIONS has been re-run.
      expect(
        reachable,
        `Trigger functions granted to a client role -- almost certainly a ` +
          `blanket "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public" that ` +
          `re-widened them:\n  ${reachable.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  itLive("anon holds only the two sanctioned table privileges", () => {
    // Moved here from definer-search-path.test.ts, which tried to infer this
    // by scanning migration text for GRANT ... TO anon. That inference cannot
    // account for a later REVOKE and cannot see a grant made out of band --
    // the same blind spot that let four definer functions sit anon-executable
    // with every file on disk reading clean. Asking the catalog is exact.
    const granted = psql(`
      SELECT c.relname || ': ' || string_agg(DISTINCT p.priv, ',' ORDER BY p.priv)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
        AND has_table_privilege('anon', c.oid, p.priv)
      GROUP BY c.relname
      ORDER BY c.relname;
    `);

    // The only two anon table privileges this app needs:
    //   applications INSERT -- the public job-application form
    //   faq SELECT          -- published owner-operator FAQs, row-filtered by
    //                          a TO public policy
    // Anything else means a table was created without scoped GRANTs, or a
    // blanket "GRANT ... ON ALL TABLES IN SCHEMA public TO anon" was run.
    expect(
      granted,
      `Unexpected anon table privileges. Every row here is readable or ` +
        `writable by an unauthenticated client:\n  ${granted.join("\n  ")}`,
    ).toEqual(["applications: INSERT", "faq: SELECT"]);
  });

  itLive("the mail queue RPCs are service-role only", () => {
    const MAIL_QUEUE = [
      "enqueue_email",
      "delete_email",
      "read_email_batch",
      "move_to_dlq",
    ];

    const reachable = psql(`
      SELECT 'public.' || p.oid::regprocedure::text
             || ' <- ' || r.rolname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
      WHERE n.nspname = 'public'
        AND p.proname IN (${MAIL_QUEUE.map((f) => `'${f}'`).join(", ")})
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
      ORDER BY 1;
    `);

    // read_email_batch returned rendered auth email bodies -- magic links,
    // recovery links -- to any caller holding EXECUTE. Every legitimate caller
    // is an Edge Function using the service role.
    expect(
      reachable,
      `Mail queue RPCs reachable by a client role. read_email_batch returns ` +
        `rendered auth emails including magic links:\n  ${reachable.join("\n  ")}`,
    ).toEqual([]);
  });

  itLive(
    "no NEW SECURITY DEFINER function is executable by anon",
    () => {
      const live = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY 1;
      `);

      const known = new Set(KNOWN_ANON_EXECUTABLE);
      const unexpected = live.filter((f) => !known.has(f));

      expect(
        unexpected,
        `SECURITY DEFINER function(s) callable by an unauthenticated client ` +
          `and not in the 2026-08-01 inventory. Either revoke EXECUTE from ` +
          `anon, or -- if this really is a token-gated public endpoint -- add ` +
          `it to KNOWN_ANON_EXECUTABLE with a comment saying why and bump ` +
          `KNOWN_ANON_EXECUTABLE_MAX:\n  ${unexpected.join("\n  ")}`,
      ).toEqual([]);

      // Stale entries are reported but not failed: a function can legitimately
      // be dropped, and failing the build for that would punish cleanup.
      const stale = KNOWN_ANON_EXECUTABLE.filter((f) => !live.includes(f));
      if (stale.length > 0) {
        console.warn(
          `KNOWN_ANON_EXECUTABLE has ${stale.length} entr(y|ies) no longer ` +
            `anon-executable. Remove them and lower ` +
            `KNOWN_ANON_EXECUTABLE_MAX:\n  ${stale.join("\n  ")}`,
        );
      }
    },
  );

  it("the authenticated allowlist may only shrink", () => {
    expect(KNOWN_AUTHENTICATED_EXECUTABLE.length).toBeLessThanOrEqual(
      KNOWN_AUTHENTICATED_EXECUTABLE_MAX,
    );
    // Same reasoning as the anon list: the MAX only caps what it counts.
    // This list is currently at 66 to carry the interim certify_rods_day
    // pair deliberately, which is exactly the situation where a duplicate
    // would be easiest to mistake for the sanctioned second entry.
    expect(
      duplicatesIn(KNOWN_AUTHENTICATED_EXECUTABLE),
      "duplicate entries in KNOWN_AUTHENTICATED_EXECUTABLE",
    ).toEqual([]);
  });

  itLive(
    "no NEW SECURITY DEFINER function is executable by authenticated",
    () => {
      const live = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prorettype <> 'trigger'::regtype
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        ORDER BY 1;
      `);

      const known = new Set(KNOWN_AUTHENTICATED_EXECUTABLE);
      const unexpected = live.filter((f) => !known.has(f));

      expect(
        unexpected,
        `SECURITY DEFINER function(s) callable by any signed-in user and not ` +
          `in the 2026-08-01 inventory. A definer function runs as its owner, ` +
          `so "any signed-in user" is the whole driver population. Either ` +
          `revoke EXECUTE, or add it here with a comment and bump ` +
          `KNOWN_AUTHENTICATED_EXECUTABLE_MAX:\n  ${unexpected.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  itLive(
    "every SECURITY DEFINER trigger function is attached to a live trigger",
    () => {
      // Counterpart to the revoke check above. Revoking EXECUTE on 53 trigger
      // functions is safe precisely BECAUSE PostgreSQL checks that privilege
      // at CREATE TRIGGER time -- which only holds while the trigger is still
      // attached. An orphaned definer trigger function is dead privileged code
      // sitting in an exposed schema, and it is also how a revoke silently
      // becomes load-bearing.
      const orphans = psql(`
        SELECT 'public.' || p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prorettype = 'trigger'::regtype
          AND NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE t.tgfoid = p.oid AND NOT t.tgisinternal
          )
        ORDER BY 1;
      `);

      expect(
        orphans,
        `SECURITY DEFINER trigger function(s) not attached to any trigger. ` +
          `Drop them or attach them:\n  ${orphans.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  itLive(
    "no RLS table without policies holds client-role grants",
    () => {
      // RLS-on + zero-policies denies every row to a client role, so a grant
      // on such a table looks harmless. It is not: it is a live privilege
      // waiting for the first policy anyone adds, and in the meantime it turns
      // real permission errors into silent empty results, which is how the
      // "0 unused resume tokens" reading in RevertRevisionModal went unnoticed.
      // Fixed 2026-08-01 for application_resume_tokens, document_short_links
      // and message_notification_throttle.
      const leaky = psql(`
        SELECT c.relname || ' <- ' || r.rolname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relrowsecurity
          AND NOT EXISTS (
            SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid
          )
          AND (
            has_table_privilege(r.rolname, c.oid, 'SELECT')
            OR has_table_privilege(r.rolname, c.oid, 'INSERT')
            OR has_table_privilege(r.rolname, c.oid, 'UPDATE')
            OR has_table_privilege(r.rolname, c.oid, 'DELETE')
          )
        ORDER BY 1;
      `);

      expect(
        leaky,
        `Table(s) with RLS enabled, no policies, and client-role grants. ` +
          `Either write the policy or revoke the grant -- do not leave both ` +
          `half-done:\n  ${leaky.join("\n  ")}`,
      ).toEqual([]);
    },
  );
});
