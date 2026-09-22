/**
 * Pay rates are owner-only (migration 0027, owner decisions 2026-09-21).
 *
 * Two locks, both closed by default — the permissions are registered with NO
 * role grants and are deliberately absent from seed_role_permissions, so only
 * the owner short-circuit in has_permission() passes them:
 *
 *   pay_policy.change  — writing pay_policies / pay_policy_assignments
 *   driver_pay.change  — ica_contracts.linehaul_split_pct once the agreement has
 *                        been sent for signature, and operators.pay_percentage
 *                        at all times
 *
 * contractor_pay_setup is deliberately untouched: it holds no pay figures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appliedMigrationSql } from './helpers/migrationFunctions';

const ROOT = process.cwd();
const MIGRATION = appliedMigrationSql('pay_rates_owner_only');
const SEED = appliedMigrationSql('permissions_foundation_and_three_actions');
const BUILDER = readFileSync(join(ROOT, 'src/components/ica/ICABuilderModal.tsx'), 'utf8');

describe('registered permissions', () => {
  it('registers both actions as change-kind', () => {
    expect(MIGRATION).toContain("'pay_policy.change'");
    expect(MIGRATION).toContain("'driver_pay.change'");
    expect(MIGRATION).toMatch(/pay_policy\.change[\s\S]{0,200}'change'/);
    expect(MIGRATION).toMatch(/driver_pay\.change[\s\S]{0,200}'change'/);
  });

  it('grants them to no role at all', () => {
    // A role grant would be an INSERT into role_permissions naming the action.
    expect(MIGRATION).not.toMatch(/INSERT INTO public\.role_permissions[\s\S]*?(pay_policy\.change|driver_pay\.change)/);
  });

  it('keeps them out of the seeding function', () => {
    expect(SEED).not.toContain('pay_policy.change');
    expect(SEED).not.toContain('driver_pay.change');
  });
});

describe('pay policies and assignments', () => {
  it('requires the permission on every write, for both tables', () => {
    for (const table of ['pay_policies', 'pay_policy_assignments']) {
      for (const verb of ['insert', 'update', 'delete']) {
        expect(MIGRATION).toMatch(
          new RegExp(`CREATE POLICY "${table}_${verb}_permission"[\\s\\S]{0,400}has_permission\\(auth\\.uid\\(\\), 'pay_policy\\.change'\\)`),
        );
      }
    }
  });

  it('drops only the old management write policies and leaves reads alone', () => {
    expect(MIGRATION).toMatch(/DROP POLICY IF EXISTS "pay_policies_insert_management"/);
    expect(MIGRATION).not.toMatch(/DROP POLICY IF EXISTS "pay_policies_select/);
    expect(MIGRATION).not.toMatch(/DROP POLICY IF EXISTS "pay_policy_assignments_select/);
  });
});

describe('the contracted percentage on an agreement', () => {
  it('only bites once the agreement is no longer a draft', () => {
    expect(MIGRATION).toContain('ab_guard_ica_linehaul_split');
    expect(MIGRATION).toMatch(/NEW\.linehaul_split_pct IS DISTINCT FROM OLD\.linehaul_split_pct/);
    expect(MIGRATION).toMatch(/COALESCE\(OLD\.status, *'draft'\) *(<>|!=) *'draft'/);
    expect(MIGRATION).toMatch(/NOT public\.has_permission\(auth\.uid\(\), 'driver_pay\.change'\)/);
  });

  it('leaves the 0023 driver-side guard in place', () => {
    // 'aa_' fires before 'ab_': a driver still gets the 0023 message.
    expect(MIGRATION).not.toMatch(/DROP (TRIGGER|FUNCTION)[^;]*aa_guard_ica_contract_terms/);
  });

  it('lets a service-role writer through so it can check the caller itself', () => {
    expect(MIGRATION).toMatch(/auth\.uid\(\) IS NULL[\s\S]{0,80}RETURN NEW/);
  });
});

describe("the percentage on the driver's record", () => {
  it('is guarded on every update, with no draft escape hatch', () => {
    expect(MIGRATION).toContain('ab_guard_operator_pay_percentage');
    expect(MIGRATION).toMatch(/NEW\.pay_percentage IS DISTINCT FROM OLD\.pay_percentage/);
    expect(MIGRATION).toMatch(/BEFORE UPDATE ON public\.operators/);
    // INSERT is untouched, so creating a driver still works.
    expect(MIGRATION).not.toMatch(/BEFORE INSERT[^;]*ON public\.operators/);
  });

  it('records for the versioning pass that the same figure lives in two places', () => {
    expect(MIGRATION).toMatch(/COMMENT ON COLUMN public\.operators\.pay_percentage/);
    expect(MIGRATION).toMatch(/linehaul_split_pct/);
  });
});

describe('the agreement builder screen', () => {
  it('asks the database whether this person may change contracted pay', () => {
    expect(BUILDER).toContain("_action: 'driver_pay.change'");
  });

  it('locks the percentage field on a sent agreement only', () => {
    expect(BUILDER).toMatch(/payLocked = !!contractStatus && contractStatus !== 'draft' && !canChangeDriverPay/);
    expect(BUILDER).toMatch(/readOnly=\{payLocked\}/);
    expect(BUILDER).toMatch(/disabled=\{payLocked\}/);
  });

  it('says why, instead of failing silently', () => {
    expect(BUILDER).toContain('Only the owner can change the contracted split now.');
    expect(BUILDER).toMatch(/description: err\.message/);
  });
});
