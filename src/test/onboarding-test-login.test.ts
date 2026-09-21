import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * ONBOARDING-ONLY TEST LOGIN — 2026-09-21.
 *
 * Permission proofs needed a real staff identity holding exactly one role:
 * onboarding_staff. The foundation pass and the staff-suspension pass both
 * recorded that no such identity existed, so the "onboarding staff refused"
 * arm had never run with a live session.
 *
 * The account must stay harmless: never offered as a coordinator, never
 * counted as onboarding workload, never offered as a notification assignee,
 * never emailed, and visibly a test account in the Staff Directory. Those are
 * source-order arms here, because a screen filter cannot be read from the
 * catalog. The live arms check the account itself.
 */

const TEST_USER_ID = 'bc0bf6aa-8e61-4ef6-ad03-62e655231898';
const TEST_EMAIL = 'onboarding-test@demo.mysupertransport.com';
const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('onboarding-test-login.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so the account, its single role and its email suppression',
    'could not be read from the catalog. The source-order arms still ran.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', timeout: 30_000 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

describe('the onboarding-only test login is real, single-role and harmless', () => {
  itLive('the profile exists, is active, and is flagged as a test account', () => {
    const rows = psql(`
      SELECT account_status || '|' || is_test_account || '|' || is_demo
        FROM public.profiles WHERE user_id = '${TEST_USER_ID}';
    `);
    expect(rows).toEqual(['active|true|false']);
  });

  itLive('it holds EXACTLY one role, onboarding_staff', () => {
    const roles = psql(`
      SELECT role::text FROM public.user_roles WHERE user_id = '${TEST_USER_ID}' ORDER BY 1;
    `);
    expect(roles).toEqual(['onboarding_staff']);
  });

  itLive('it is a member of exactly one company — a staff role without membership works for nobody', () => {
    const rows = psql(`
      SELECT count(*)::text FROM public.company_members WHERE user_id = '${TEST_USER_ID}';
    `);
    expect(rows).toEqual(['1']);
  });

  itLive('its address is suppressed, so no email can ever reach it', () => {
    const rows = psql(`SELECT count(*)::text FROM public.suppressed_emails WHERE email = '${TEST_EMAIL}';`);
    expect(rows).toEqual(['1']);
  });

  itLive('no driver is assigned to it, and it carries no birthday for the greeting jobs', () => {
    const assigned = psql(`
      SELECT count(*)::text FROM public.operators WHERE assigned_onboarding_staff = '${TEST_USER_ID}';
    `);
    expect(assigned).toEqual(['0']);
    const birthday = psql(`
      SELECT coalesce(birth_month::text, 'null') || '|' || coalesce(birth_day::text, 'null')
        FROM public.profiles WHERE user_id = '${TEST_USER_ID}';
    `);
    expect(birthday).toEqual(['null|null']);
  });

  itLive('every change-kind permission answers false for it; only the view actions it holds answer true', () => {
    const rows = psql(`
      SELECT a.key || '=' || public.has_permission('${TEST_USER_ID}'::uuid, a.key)
        FROM public.permission_actions a WHERE a.is_active ORDER BY a.key;
    `);
    const answers = new Map(rows.map((r) => r.split('=') as [string, string]));
    for (const [key, value] of answers) {
      const kind = psql(`SELECT kind FROM public.permission_actions WHERE key = '${key}';`)[0];
      if (kind === 'change') {
        expect(value, `${key} is a change action and must be refused`).toBe('false');
      }
    }
    // The two view grants onboarding staff holds today.
    expect(answers.get('company_document.view')).toBe('true');
    expect(answers.get('lease_termination.view')).toBe('true');
    // P2 keeps settlement and invoice viewing with dispatcher and management.
    expect(answers.get('settlement.view')).toBe('false');
    expect(answers.get('invoice.view')).toBe('false');
  });

  it('a test account is never offered as a coordinator', () => {
    const pipeline = readFileSync('src/pages/staff/PipelineDashboard.tsx', 'utf8');
    expect(pipeline).toContain('is_test_account');
    expect(pipeline).toContain('if (p && p.is_test_account !== true)');
  });

  it('a test account is never offered as a notification assignee', () => {
    const modal = readFileSync('src/components/staff/AssignNotificationModal.tsx', 'utf8');
    expect(modal).toMatch(/is_test_account\s*===\s*true\) continue/);
  });

  it('a test account carries no onboarding workload and is never auto-assigned', () => {
    const portal = readFileSync('src/pages/management/ManagementPortal.tsx', 'utf8');
    expect(portal).toContain("m.is_test_account !== true");
  });

  it('the staff list reports the flag and the Staff Directory badges it', () => {
    const fn = readFileSync('supabase/functions/get-staff-list/index.ts', 'utf8');
    expect(fn).toContain('is_test_account');
    const directory = readFileSync('src/components/management/StaffDirectory.tsx', 'utf8');
    expect(directory).toContain('member.is_test_account');
  });

  it('no password for the account is committed to the repository', () => {
    const status = readFileSync('docs/tms-build-status.md', 'utf8');
    expect(status).toContain(TEST_USER_ID);
    expect(status).toContain('TEST_ONBOARDING_STAFF_PASSWORD');
    expect(status).not.toMatch(/onboarding-test@demo\.mysupertransport\.com[^\n]*password\s*[:=]\s*\S/i);
  });
});
