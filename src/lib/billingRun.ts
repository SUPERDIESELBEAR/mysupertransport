/**
 * MODULE 7 (Billing & Invoicing), PASS 3 — gather, build, store.
 *
 * Same three layers, and the same division of labour, as Module 4 Pass 4:
 *
 *   GATHERING  reads the loads at `ready_to_invoice` with their charges and
 *              decides nothing.
 *   BUILD      is `buildLoadInvoice` (Pass 2), the pure builder, untouched.
 *   STORE      is `public.create_invoice`, the single writer.
 *
 * The money is computed HERE, in TypeScript, and the RPC persists what it is
 * handed. Re-deriving the invoice in PL/pgSQL would put the rules in two
 * languages. What stops a caller persisting a figure the rules would not
 * produce is that the RPC REFUSES rather than produces: lines that do not sum
 * to the stated amount, a load that is not `ready_to_invoice`, a second
 * invoice for a load that already has one, and a charge set that does not
 * match the load's charges in BOTH directions.
 *
 * The billing path is the one thing the client does not decide. It is a fact
 * about the broker, frozen at build time from `factoring_status`, and the RPC
 * refuses a payload that claims a different one. Nine of eleven live brokers
 * are `unknown` today, so nearly everything bills DIRECT — that is correct,
 * and the queue shows it rather than hiding it.
 */
import { buildLoadInvoice, type BuiltInvoice } from '@/lib/invoiceBuilder';
import type { LoadChargeRecord } from '@/lib/loadCharges';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type BillingPath = 'factored' | 'direct';

export interface QueuedLoad {
  loadId: string;
  loadNumber: string;
  brokerId: string | null;
  brokerName: string | null;
  factoringStatus: string | null;
  /** Frozen from the broker's factoring status; only `approved` bills factored. */
  billingPath: BillingPath;
  deliveredAt: string | null;
  invoice: BuiltInvoice;
}

/** Only an APPROVED broker bills factored. Unknown and not-approved bill direct. */
export function billingPathFor(factoringStatus: string | null | undefined): BillingPath {
  return factoringStatus === 'approved' ? 'factored' : 'direct';
}

const LOAD_COLUMNS =
  'id, load_number, load_type, status, broker_id, delivered_at, rate_type, '
  + 'linehaul_rate, rate_per_mile, loaded_miles, rate_per_ton, confirmed_tons, '
  + 'fsc_amount, fsc_bundled_into_linehaul, loadout_relocation_fee, '
  + 'brokers(id, company_name, factoring_status), '
  + 'load_charges(id, load_id, load_stop_id, charge_type, description, amount, source, '
  + 'funding_source, actual_cost, proof_document_id)';

/** Every load at `ready_to_invoice`, oldest delivery first, with what it would bill. */
export async function gatherBillingQueue(sb: Client): Promise<QueuedLoad[]> {
  const { data, error } = await sb
    .from('loads')
    .select(LOAD_COLUMNS)
    .eq('status', 'ready_to_invoice')
    .order('delivered_at', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Could not read the billing queue: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const broker = Array.isArray(row.brokers) ? row.brokers[0] : row.brokers;
    const charges = (row.load_charges ?? []) as LoadChargeRecord[];
    return {
      loadId: row.id,
      loadNumber: row.load_number,
      brokerId: row.broker_id ?? null,
      brokerName: broker?.company_name ?? null,
      factoringStatus: broker?.factoring_status ?? null,
      billingPath: billingPathFor(broker?.factoring_status),
      deliveredAt: row.delivered_at ?? null,
      invoice: buildLoadInvoice({
        id: row.id,
        loadNumber: row.load_number,
        loadType: row.load_type,
        rateType: row.rate_type,
        linehaulRate: row.linehaul_rate,
        ratePerMile: row.rate_per_mile,
        loadedMiles: row.loaded_miles,
        ratePerTon: row.rate_per_ton,
        confirmedTons: row.confirmed_tons,
        fscAmount: row.fsc_amount,
        fscBundledIntoLinehaul: row.fsc_bundled_into_linehaul,
        loadoutRelocationFee: row.loadout_relocation_fee,
        charges,
      }),
    } satisfies QueuedLoad;
  });
}

export interface StoredInvoice {
  invoiceId: string;
  invoiceNumber: string;
  billingPath: BillingPath;
  amount: number;
  loadNumber: string;
}

/** Hand the built invoice to the writer. The number is allocated by the WRITE. */
export async function storeInvoice(sb: Client, queued: QueuedLoad): Promise<StoredInvoice> {
  const { data, error } = await sb.rpc('create_invoice', {
    p_load_id: queued.loadId,
    p_payload: {
      amount: queued.invoice.amount,
      billing_path: queued.billingPath,
      lines: queued.invoice.lines.map((l) => ({
        line_type: l.lineType,
        description: l.description,
        amount: l.amount,
        load_charge_id: l.loadChargeId,
        charge_type: l.chargeType,
      })),
    },
  });

  if (error) throw new Error(error.message);
  const r = data as any;
  return {
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    billingPath: r.billing_path,
    amount: Number(r.amount),
    loadNumber: r.load_number,
  };
}
