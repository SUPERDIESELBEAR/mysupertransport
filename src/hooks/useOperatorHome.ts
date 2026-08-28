import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  assembleBoard, type BoardLoadInput, type ChainLoad,
} from '@/lib/dispatchBoard';
import type { PaperworkDocumentInput, PaperworkExceptionInput } from '@/lib/loadPaperwork';
import { evaluateLoadPaperwork } from '@/lib/loadPaperwork';
import { fetchEffectivePayPolicy } from '@/lib/payTreatment';
import { estimateDriverLoadPay, type DriverLoadPayEstimate } from '@/lib/driverLoadPay';
import type { LoadChargeRecord } from '@/lib/loadCharges';
import { nextStop, type HomeStop } from '@/lib/operatorHome';

export interface HomeLoad extends ChainLoad {
  loadType: string | null;
  brokerName: string | null;
  stops: HomeStop[];
  /** The stop the driver is heading to. */
  next: HomeStop | null;
  /** Required paperwork still outstanding, in matrix order. */
  outstandingPaperwork: string[];
}

export interface OperatorHomeData {
  loading: boolean;
  /** The load being driven. Null when the driver has no driving work today. */
  current: HomeLoad | null;
  /** Everything else pre-delivery, ascending. */
  queued: HomeLoad[];
  /** Delivered loads still owing required paperwork. Office work, not driving. */
  paperworkTail: HomeLoad[];
  /** Driver's estimated pay for `current`. Never a gross, never a percentage. */
  currentPay: DriverLoadPayEstimate | null;
  refresh: () => void;
}

const EMPTY: Omit<OperatorHomeData, 'refresh'> = {
  loading: true, current: null, queued: [], paperworkTail: [], currentPay: null,
};

/**
 * The driver's own work, read through the SAME chain rule the Dispatch Board
 * uses (src/lib/dispatchBoard.ts). Home and the board must never disagree about
 * which load a driver is on, so this hook assembles rather than re-deriving.
 *
 * Read-only. Pass 1 writes nothing against loads.
 */
export function useOperatorHome(operatorId: string | null | undefined): OperatorHomeData {
  const [state, setState] = useState(EMPTY);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!operatorId) { setState({ ...EMPTY, loading: false }); return; }
    setState(s => ({ ...s, loading: true }));

    (async () => {
      const { data: loadRows, error } = await supabase
        .from('loads')
        .select(
          'id, load_number, status, load_type, operator_id, created_at, '
          + 'brokers(company_name), '
          + 'load_stops(stop_sequence, stop_type, facility_name, city, state, '
          + 'appointment_start, appointment_end, actual_departure_at)',
        )
        .eq('operator_id', operatorId);

      if (error) {
        console.error('[useOperatorHome] loads read failed', error);
        if (!cancelled) setState({ ...EMPTY, loading: false });
        return;
      }

      const rows = (loadRows ?? []) as any[];
      const ids = rows.map(r => r.id as string);

      const [{ data: docRows }, { data: excRows }] = await Promise.all([
        ids.length
          ? supabase.from('load_documents').select('load_id, document_type, photo_label').in('load_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? supabase.from('document_exceptions').select('load_id, document_type, status').in('load_id', ids)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const documentsByLoad: Record<string, PaperworkDocumentInput[]> = {};
      (docRows ?? []).forEach((d: any) => {
        (documentsByLoad[d.load_id] ??= []).push({ document_type: d.document_type, photo_label: d.photo_label });
      });
      const exceptionsByLoad: Record<string, PaperworkExceptionInput[]> = {};
      (excRows ?? []).forEach((e: any) => {
        (exceptionsByLoad[e.load_id] ??= []).push({ document_type: e.document_type, status: e.status });
      });

      const boardLoads: BoardLoadInput[] = rows.map(r => ({
        id: r.id,
        load_number: r.load_number,
        status: r.status,
        load_type: r.load_type,
        operator_id: r.operator_id,
        created_at: r.created_at,
        stops: (r.load_stops ?? []).map((s: any) => ({
          stop_sequence: s.stop_sequence, stop_type: s.stop_type,
          city: s.city, state: s.state, appointment_start: s.appointment_start,
        })),
      }));

      const { rows: chains } = assembleBoard({
        drivers: [{
          operator_id: operatorId, name: 'me', unit_number: null,
          dispatch_status: null, dispatchable: true,
        }],
        loads: boardLoads,
        documentsByLoad,
        exceptionsByLoad,
      });
      const chain = chains[0];

      const byId = new Map(rows.map(r => [r.id as string, r]));
      const decorate = (c: ChainLoad): HomeLoad => {
        const raw = byId.get(c.id);
        const stops: HomeStop[] = (raw?.load_stops ?? []).map((s: any) => ({
          stop_sequence: s.stop_sequence, stop_type: s.stop_type,
          facility_name: s.facility_name, city: s.city, state: s.state,
          appointment_start: s.appointment_start, appointment_end: s.appointment_end,
          actual_departure_at: s.actual_departure_at,
        }));
        const paperwork = evaluateLoadPaperwork(
          raw?.load_type, documentsByLoad[c.id] ?? [], exceptionsByLoad[c.id] ?? [],
        );
        return {
          ...c,
          loadType: raw?.load_type ?? null,
          brokerName: raw?.brokers?.company_name ?? null,
          stops,
          next: nextStop(stops),
          outstandingPaperwork: paperwork.outstandingRequired.map(r => r.label),
        };
      };

      const current = chain?.current ? decorate(chain.current) : null;
      const queued = (chain?.queued ?? []).map(decorate);
      const paperworkTail = (chain?.paperworkTail ?? []).map(decorate);

      let currentPay: DriverLoadPayEstimate | null = null;
      if (current) {
        const [{ data: charges }, policy] = await Promise.all([
          supabase
            .from('load_charges')
            .select('id, load_id, load_stop_id, charge_type, description, amount, source, funding_source, actual_cost, proof_document_id')
            .eq('load_id', current.id),
          fetchEffectivePayPolicy(operatorId),
        ]);
        currentPay = estimateDriverLoadPay((charges ?? []) as unknown as LoadChargeRecord[], policy);
      }

      if (!cancelled) {
        setState({ loading: false, current, queued, paperworkTail, currentPay });
      }
    })();

    return () => { cancelled = true; };
  }, [operatorId, tick]);

  return { ...state, refresh };
}
