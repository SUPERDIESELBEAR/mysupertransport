import { describe, expect, it } from 'vitest';
import { readSource } from '@/test/helpers/repoLiterals';

const operatorDetail = readSource('src/pages/staff/OperatorDetailPanel.tsx');
const card = readSource('src/components/staff/LinehaulPayCard.tsx');
const settings = readSource('src/components/management/CompanyPayPolicySettings.tsx');
const settingsPage = readSource('src/pages/management/SettlementSettingsPage.tsx');
const builder = readSource('src/components/ica/ICABuilderModal.tsx');
const review = readSource('src/pages/management/SettlementRunPage.tsx');
const driverView = readSource('src/components/operator/MySettlements/MySettlements.tsx');
const presentation = readSource('src/lib/payRatePresentation.ts');

describe('per-driver pay screens', () => {
  it('puts the driver card on the staff record but limits it to management', () => {
    expect(operatorDetail).toContain('<LinehaulPayCard');
    expect(operatorDetail).toMatch(/\{isManagement && \([\s\S]*?<LinehaulPayCard/);
    expect(card).toContain("has_permission', { _action: 'driver_pay.change' }");
    expect(card).toContain("rpc('set_operator_linehaul_pct'");
    expect(card).toContain('driverRateConfirmation');
    expect(presentation).toContain('Weeks already settled are unaffected');
  });

  it('puts dated company versions beside Settlement Settings and uses the sole writer', () => {
    expect(settingsPage).toContain('<CompanyPayPolicySettings />');
    expect(settings).toContain("has_permission', { _action: 'pay_policy.change' }");
    expect(settings).toContain("rpc('open_pay_policy_version'");
    expect(settings).toContain('carried forward');
  });

  it('prefills only an unsaved agreement from the dated effective rate', () => {
    expect(builder).toContain('fetchEffectiveOperatorLinehaul');
    expect(builder).toMatch(/if \(!existing\)[\s\S]*linehaul_split_pct: effectiveLinehaul\?\.pct/);
    expect(builder).toContain("contractStatus !== 'draft' && !canChangeDriverPay");
  });

  it('warns staff before payment and reads stored rate records without exposing them to drivers', () => {
    expect(review).toContain('Agreement mismatch — review before money moves.');
    expect(review).toContain("from('settlement_line_items')");
    expect(review).toContain('rateRecordLabel(line.resolved_pct');
    expect(driverView).not.toMatch(/resolved_pct|resolvedPct|pct_source|pctSource|pct_version|percentage/i);
  });
});