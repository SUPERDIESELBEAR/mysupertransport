/* TEMPORARY settlement harness — deleted at the end of this run. */
import { execFileSync } from 'node:child_process';
import { computeSettlement, type SettlementLoadInput } from '@/lib/settlementEngine';
import { DEFAULT_SETTLEMENT_SETTINGS } from '@/lib/settlementConfig';

const q = (sql: string) => {
  const out = execFileSync('psql', ['-t', '-A', '-c', sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : null;
};

const PRATT = 'f2051752-5311-4c1f-b88c-79773e7ed9e5';
const loadNumbers = process.argv.slice(2);
if (!loadNumbers.length) throw new Error('pass load numbers');

const settings = q(`select row_to_json(s) from settlement_settings s limit 1`) ?? DEFAULT_SETTLEMENT_SETTINGS;
const companyPolicy = q(`select row_to_json(p) from pay_policies p where is_company_default limit 1`);
const rows = q(`select coalesce(json_agg(x),'[]') from (
  select l.id, l.load_number, l.load_type, l.rate_type, l.delivered_at,
         l.linehaul_rate, l.rate_per_mile, l.loaded_miles, l.rate_per_ton,
         l.confirmed_tons, l.estimated_tons, l.fsc_amount, l.fsc_bundled_into_linehaul,
         l.loadout_relocation_fee, l.total_load_value, l.status,
         (select coalesce(json_agg(c),'[]') from load_charges c where c.load_id=l.id) charges,
         (select coalesce(json_agg(json_build_object('document_type',d.document_type,'photo_label',d.photo_label)),'[]')
            from load_documents d where d.load_id=l.id) documents,
         (select coalesce(json_agg(json_build_object('document_type',e.document_type,'status',e.status,'photo_label',e.photo_label)),'[]')
            from document_exceptions e where e.load_id=l.id) exceptions,
         (select coalesce(json_agg(json_build_object('level',f.flag_level,'active',f.is_active)),'[]')
            from claim_flags f where f.load_id=l.id and f.is_active) claims
  from loads l where l.load_number in (${loadNumbers.map(n => `'${n}'`).join(',')})
) x`) as any[];

const rm = q(`select row_to_json(r) from rm_deposits r where operator_id='${PRATT}' limit 1`);

for (const r of rows) {
  console.log(`READBACK ${r.load_number}: type=${r.load_type} rate_type=${r.rate_type} status=${r.status} ` +
    `linehaul=${r.linehaul_rate} fsc=${r.fsc_amount} bundled=${r.fsc_bundled_into_linehaul} ` +
    `per_ton=${r.rate_per_ton} est=${r.estimated_tons} conf=${r.confirmed_tons} ` +
    `loadout_fee=${r.loadout_relocation_fee} total=${r.total_load_value} delivered_at=${r.delivered_at}`);
  console.log(`  charges: ${JSON.stringify((r.charges as any[]).map(c => [c.charge_type, c.amount, c.funding_source, c.actual_cost]))}`);
  console.log(`  docs: ${JSON.stringify((r.documents as any[]).map(d => [d.document_type, d.photo_label]))}`);
  console.log(`  active claims: ${JSON.stringify(r.claims)}`);
}

const loads: SettlementLoadInput[] = rows.map(r => ({
  id: r.id, loadNumber: r.load_number, loadType: r.load_type,
  deliveredAt: r.delivered_at, charges: r.charges,
  rateType: r.rate_type, linehaulRate: r.linehaul_rate, ratePerMile: r.rate_per_mile,
  loadedMiles: r.loaded_miles, ratePerTon: r.rate_per_ton,
  confirmedTons: r.confirmed_tons, estimatedTons: r.estimated_tons,
  fscAmount: r.fsc_amount, fscBundledIntoLinehaul: r.fsc_bundled_into_linehaul,
  loadoutRelocationFee: r.loadout_relocation_fee,
  documents: r.documents, exceptions: r.exceptions,
}));

const anchor = String(rows.find(r => r.delivered_at)?.delivered_at ?? new Date().toISOString()).slice(0, 10);
const result = computeSettlement({
  operatorId: PRATT,
  periodAnchorDate: anchor,
  settings: settings as any,
  companyPolicy: companyPolicy as any,
  loads,
  rmDeposit: rm as any,
});

console.log('\nPERIOD', result.period.start_date, '->', result.period.end_date, '(anchor', anchor + ')');
console.log('LINES');
for (const l of result.lines) console.log(`  ${l.lineType.padEnd(12)} ${String(l.amount).padStart(10)}  ${l.description}`);
console.log('GROSS', result.grossAmount, 'DEDUCTIONS', result.deductionsAmount, 'NET', result.netAmount);
console.log('STATUS', result.status, 'holdReason', result.holdReason);
console.log('WITHHELD', JSON.stringify(result.withheldLoads, null, 1));
console.log('PENDING SCALE TICKET', JSON.stringify(result.pendingScaleTicketLoads, null, 1));
console.log('RM DEPOSIT ROW', JSON.stringify(rm));
