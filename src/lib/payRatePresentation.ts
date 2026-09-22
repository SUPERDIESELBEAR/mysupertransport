import { formatLongDay } from '@/lib/settlementMath';

export type RateSource = 'driver_version' | 'company_policy';

export function rateSourceLabel(source: RateSource | null | undefined): string {
  return source === 'driver_version' ? 'his rate' : source === 'company_policy' ? 'company rate sheet' : 'not recorded';
}

export function rateRecordLabel(pct: number | null | undefined, source: RateSource | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct)) || !source) return 'not recorded';
  return `${Number(pct)}% — ${rateSourceLabel(source)}`;
}

export function driverRateConfirmation(name: string, oldPct: number, newPct: number, effectiveFrom: string): string {
  return `Loads delivered from ${formatLongDay(effectiveFrom)} onward pay ${newPct}% instead of ${oldPct}%. Weeks already settled are unaffected.`;
}

export function companyRateConfirmation(changes: Array<{ label: string; from: number; to: number }>, effectiveFrom: string): string {
  const changed = changes.filter(c => c.from !== c.to);
  const summary = changed.length === 0
    ? 'No rates change'
    : changed.map(c => `${c.label} changes from ${c.from}% to ${c.to}%`).join('; ');
  return `${summary} for loads delivered from ${formatLongDay(effectiveFrom)} onward. Earlier work weeks keep their existing rate sheet.`;
}

export function agreementMismatch(agreementPct: number | null | undefined, payingPct: number | null | undefined): boolean {
  return agreementPct !== null && agreementPct !== undefined
    && payingPct !== null && payingPct !== undefined
    && Number(agreementPct) !== Number(payingPct);
}
