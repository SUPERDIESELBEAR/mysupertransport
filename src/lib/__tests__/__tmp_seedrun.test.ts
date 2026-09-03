import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeDispatchSettlement } from '@/lib/dispatchSettlement';

it('seed run', () => {
  const d = JSON.parse(readFileSync('/tmp/seed.json', 'utf8'));
  const names = new Map((d.dispatchers ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]));
  const r = computeDispatchSettlement({
    month: '2026-08',
    dispatchRate: d.rates.dispatch_pct,
    factoringRate: d.rates.factoring_pct,
    companyPolicy: d.policy,
    loads: d.loads.map((l: any) => ({
      id: l.id, loadNumber: l.load_number, loadType: l.load_type, rateType: l.rate_type,
      status: l.status, deliveredAt: l.delivered_at, linehaulRate: l.linehaul_rate,
      ratePerMile: l.rate_per_mile, loadedMiles: l.loaded_miles, ratePerTon: l.rate_per_ton,
      confirmedTons: l.confirmed_tons, fscAmount: l.fsc_amount,
      fscBundledIntoLinehaul: l.fsc_bundled_into_linehaul,
      loadoutRelocationFee: l.loadout_relocation_fee, dispatcherId: l.dispatcher_id,
      charges: l.charges ?? [],
    })),
  });
  console.log('BASE', r.eligibleBase, 'red', r.factoringReduction, 'reduced', r.reducedBase, 'fee', r.dispatchFee, 'net', r.netAmount);
  for (const c of r.contributions) {
    console.log(`LOAD ${c.loadNumber} hdr=${c.headerComponent} fsc=${c.fscComponent} chgIn=${c.chargesIncludedAmount} chgEx=${c.chargesExcludedAmount} base=${c.baseTotal} disp=${names.get(c.dispatcherId ?? '') ?? 'UNATTRIBUTED'}`);
    for (const v of c.verdicts) console.log(`   charge ${v.chargeType} ${v.amount} -> ${v.excluded ? 'EXCLUDED ' + v.exclusionReason : 'included'} pct=${v.resolvedPct}`);
  }
  for (const x of r.ineligible) console.log(`INELIGIBLE ${x.loadNumber} ${x.reason} status=${x.status} date=${x.carrierDeliveryDate}`);
  for (const b of r.byDispatcher) console.log(`BUCKET ${names.get(b.dispatcherId ?? '') ?? 'UNATTRIBUTED'} ${b.base} loads=${b.loadIds.length}`);
});
