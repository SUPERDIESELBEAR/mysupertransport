import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY PAY-RATE READER MUST BE DATED — PER-DRIVER PAY, PASS 1.
 *
 * Why this guard exists, and why it is a source guard rather than a behaviour
 * test. With exactly one pay-policy version alive, an undated reader and a dated
 * reader are INDISTINGUISHABLE: both return the only row there is. So no
 * assertion about today's output can protect this. The defect only appears on
 * the day a second version is created — and by then it is a wrong percentage on
 * a settlement, which is the one class of bug that must never reach a driver.
 *
 * The three failure modes this forbids, all observed in the code before Pass 1
 * and all reproduced against a throwaway second version on 2026-09-22:
 *
 *   `.eq('is_company_default', true).maybeSingle()`  -> matched 2 rows, THROWS,
 *       taking the whole settlement run down.
 *   a bare `.limit(1)` with no date test            -> an ARBITRARY version.
 *   `.order('effective_date', desc).limit(1)`       -> the NEWEST version, which
 *       during the probe was "THROWAWAY v2", a rate dated in the FUTURE that had
 *       not started yet.
 *
 * The rule: no module outside payPolicyVersion.ts may query `pay_policies` for
 * the company default itself. They route through the one resolver, which every
 * caller hands the date it is asking about — the work week, the month, or today.
 */

const ROOT = join(process.cwd(), "src");

/** The one module allowed to state the window, plus its own test. */
const RESOLVER = join("src", "lib", "payPolicyVersion.ts");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test" || entry === "__tests__") continue;
      sourceFiles(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\./.test(entry)) continue;
    if (full.includes(join("integrations", "supabase", "types.ts"))) continue;
    acc.push(full);
  }
  return acc;
}

const files = sourceFiles(ROOT);

describe("pay-policy readers are dated", () => {
  it("scans a non-trivial number of source files", () => {
    // A guard that silently scans nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(200);
  });

  it("no module but the resolver reads the company-default pay policy", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(process.cwd().length + 1);
      if (rel === RESOLVER) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("'pay_policies'") && !src.includes('"pay_policies"')) continue;
      // The write path in FuelDiscountPassthroughSettings updates the row it was
      // GIVEN by the resolver (P41: the pass-through switch is not versioned), so
      // only SELECT-side default filters are forbidden.
      if (/is_company_default/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `These read the company-default pay policy directly instead of through ` +
        `companyPolicyVersionQuery/fetchCompanyPolicyVersion in ${RESOLVER}. ` +
        `An undated read picks an arbitrary or future version once a second ` +
        `version exists.`,
    ).toEqual([]);
  });

  it("the resolver states both halves of the effective window", () => {
    const src = readFileSync(join(process.cwd(), RESOLVER), "utf8");
    // Open-start versions must cover earlier dates; a NULL effective_to is the
    // current version. Dropping either half makes a closed version answer for a
    // date it no longer governs.
    expect(src).toMatch(/effective_from\.is\.null,effective_from\.lte\./);
    expect(src).toMatch(/effective_to\.is\.null,effective_to\.gte\./);
    // is_active belongs in the window: a retired policy is not a payable rate.
    expect(src).toContain("'is_active', true");
    // .limit(1) before .maybeSingle() is what keeps the single read exact rather
    // than hopeful — two overlapping versions must never throw.
    expect(src).toMatch(/\.limit\(1\)[\s\S]{0,80}maybeSingle\(\)/);
  });

  it("the settlement runs resolve against their own period, not today", () => {
    const driver = readFileSync(join(ROOT, "lib", "settlementRun.ts"), "utf8");
    const dispatch = readFileSync(join(ROOT, "lib", "dispatchSettlementRun.ts"), "utf8");
    // A past week recomputed at today's rate is the exact defect P41 forbids.
    expect(driver).toContain("companyPolicyVersionQuery(sb, period.periodStart)");
    expect(dispatch).toContain("companyPolicyVersionQuery<PayPolicyRates>(sb, monthStart)");
    expect(driver).not.toContain("todayAsOf");
    expect(dispatch).not.toContain("todayAsOf");
  });
});
