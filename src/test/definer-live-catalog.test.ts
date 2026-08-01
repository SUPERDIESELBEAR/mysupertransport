import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

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
  console.warn(
    [
      "",
      "  ############################################################",
      "  #  definer-live-catalog.test.ts DID NOT RUN                #",
      "  #                                                          #",
      "  #  No PGHOST in the environment, so the live pg_proc       #",
      "  #  catalog could not be read. The SECURITY DEFINER pin and #",
      "  #  anon-EXECUTE checks are the authoritative ones, and     #",
      "  #  they are the only checks that can see grants made       #",
      "  #  outside the migration files. A green run WITHOUT this   #",
      "  #  file is not evidence the database is clean.             #",
      "  ############################################################",
      "",
    ].join("\n"),
  );
}

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
  "public.assign_user_role(uuid,app_role)",
  "public.can_driver_message_staff(uuid,uuid)",
  "public.cancel_application_correction(uuid)",
  "public.check_application_email_taken(text)",
  "public.consume_application_resume_token(text)",
  "public.create_eld_document_day(uuid,date,text,jsonb,uuid)",
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
  "public.mark_thread_read(uuid)",
  "public.match_staff_help_knowledge(vector,integer,double precision)",
  "public.move_revisions_to_pending(uuid)",
  "public.operator_awaiting_return(uuid)",
  "public.operator_return_requested(uuid)",
  "public.reject_application_correction(text,text,jsonb)",
  "public.remove_user_role(uuid,app_role)",
  "public.replace_rods_document(uuid,text,text,uuid)",
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
];

/**
 * Asserted, not advisory. Adding an entry to the list above requires editing
 * this number in the same diff -- a deliberate act, rather than a quiet append
 * while chasing a red test.
 */
const KNOWN_ANON_EXECUTABLE_MAX = 58;


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
  "public.count_unused_resume_tokens(uuid)",
  // INTERIM PAIR. The eight-argument form is the live one; the seven-argument
  // form is kept only so certify entries already queued on drivers' phones --
  // some offline for days -- keep resolving across the deploy gap. Dropping it
  // with the client deploy would fail those calls as `server`, burning their
  // attempt budget instead of waiting. Removal trigger and the drop statement
  // are in docs/deferred-removals.md.
  "public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb)",
  "public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb,jsonb)",
  "public.create_eld_document_day(uuid,date,text,jsonb,uuid)",
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
  "public.replace_rods_document(uuid,text,text,uuid)",
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
];

// 65 + the interim certify_rods_day overload. Goes back to 65 when the
// seven-argument form is dropped (docs/deferred-removals.md).
const KNOWN_AUTHENTICATED_EXECUTABLE_MAX = 66;

describe("live SECURITY DEFINER catalog (pg_proc)", () => {
  it("the allowlist may only shrink", () => {
    expect(KNOWN_ANON_EXECUTABLE.length).toBeLessThanOrEqual(
      KNOWN_ANON_EXECUTABLE_MAX,
    );
    expect(new Set(KNOWN_ANON_EXECUTABLE).size).toBe(
      KNOWN_ANON_EXECUTABLE.length,
    );
  });

  it.runIf(HAS_DB)(
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

  it.runIf(HAS_DB)(
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

  it.runIf(HAS_DB)("anon holds only the two sanctioned table privileges", () => {
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

  it.runIf(HAS_DB)("the mail queue RPCs are service-role only", () => {
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

  it.runIf(HAS_DB)(
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
    expect(new Set(KNOWN_AUTHENTICATED_EXECUTABLE).size).toBe(
      KNOWN_AUTHENTICATED_EXECUTABLE.length,
    );
  });

  it.runIf(HAS_DB)(
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

  it.runIf(HAS_DB)(
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

  it.runIf(HAS_DB)(
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
