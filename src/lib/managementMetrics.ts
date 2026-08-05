import { supabase } from '@/integrations/supabase/client';

/**
 * Shared eligibility + metric logic for the Management Overview cards.
 *
 * Every card, chip and badge on the Overview must derive from the same
 * predicate so the numbers always match the destination roster/pipeline view.
 */

// Staff/owner accounts that also have an operator record — never counted as drivers.
export const OWNER_USER_IDS = new Set([
  '5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe',
  '7e356f94-ce4a-47aa-8883-0e6b01d09aab',
]);

export type StageKey =
  | 'stage1_background'
  | 'stage2_documents'
  | 'stage3_ica'
  | 'stage4_mo_reg'
  | 'stage5_equipment'
  | 'stage6_insurance'
  | 'fully_onboarded';

export type StageCounts = Record<StageKey, number>;

export const emptyStageCounts = (): StageCounts => ({
  stage1_background: 0,
  stage2_documents: 0,
  stage3_ica: 0,
  stage4_mo_reg: 0,
  stage5_equipment: 0,
  stage6_insurance: 0,
  fully_onboarded: 0,
});

export type DispatchKey = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

export interface OverviewMetrics {
  /** Active, non-demo, non-owner drivers still onboarding (excludes on-hold). */
  onboarding: number;
  /** Active, non-demo drivers currently on hold (excluded from `onboarding`). */
  onHold: number;
  /** Fully onboarded, active, non-demo drivers — matches the Driver Hub roster. */
  activeDrivers: number;
  /** Drivers whose Driver Hub status is "Dispatched". */
  dispatched: number;
  /** Status breakdown across all active drivers (no dispatch row = not_dispatched). */
  dispatchBreakdown: Record<DispatchKey, number>;
  /** Screening alerts limited to eligible drivers. */
  alerts: number;
  /** Stage breakdown for the drivers counted in `onboarding` + fully onboarded. */
  stageBreakdown: StageCounts;
  /** Onboarding drivers with no onboarding_status activity in 14+ days. */
  idle: number;
}

type OsRow = Record<string, any> | null | undefined;

const one = (v: any): OsRow => (Array.isArray(v) ? v[0] : v);

/** Which stage an operator is currently on (first incomplete). */
export function getOnboardingStage(os: OsRow): StageKey {
  if (!os) return 'stage1_background';
  if (os.fully_onboarded) return 'fully_onboarded';
  const docsComplete =
    os.form_2290 === 'received' &&
    os.truck_title === 'received' &&
    os.truck_photos === 'received' &&
    os.truck_inspection === 'received';
  const icaComplete = os.ica_status === 'complete';
  const moComplete = os.mo_reg_received === 'yes';
  const equipComplete =
    os.decal_applied === 'yes' &&
    os.fuel_card_issued === 'yes' &&
    (os.eld_exempt === true || os.eld_installed === 'yes');
  if (os.mvr_ch_approval !== 'approved') return 'stage1_background';
  if (!docsComplete) return 'stage2_documents';
  if (!icaComplete) return 'stage3_ica';
  if (!moComplete) return 'stage4_mo_reg';
  if (!equipComplete) return 'stage5_equipment';
  return 'stage6_insurance';
}

export interface OperatorMetricRow {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
  is_demo: boolean | null;
  on_hold: boolean | null;
  onboarding_status: OsRow;
  active_dispatch: any;
}

/** Real, current driver record: active, not a sandbox account, not a staff/owner account. */
export function isEligibleDriver(op: OperatorMetricRow): boolean {
  if (op.is_active === false) return false;
  if (op.is_demo === true) return false;
  if (op.user_id && OWNER_USER_IDS.has(op.user_id)) return false;
  return true;
}

const OS_FIELDS =
  'mvr_ch_approval, pe_screening_result, form_2290, truck_title, truck_photos, truck_inspection, ica_status, mo_reg_received, decal_applied, eld_installed, eld_exempt, fuel_card_issued, fully_onboarded, updated_at';

export async function fetchOverviewMetrics(): Promise<OverviewMetrics> {
  const { data } = await supabase
    .from('operators')
    .select(`id, user_id, is_active, is_demo, on_hold, onboarding_status(${OS_FIELDS}), active_dispatch(dispatch_status)`)
    .eq('is_active', true);

  const rows = ((data as any[]) ?? []).map(r => ({
    ...r,
    onboarding_status: one(r.onboarding_status),
    active_dispatch: one(r.active_dispatch),
  })) as OperatorMetricRow[];

  const eligible = rows.filter(isEligibleDriver);

  const stageBreakdown = emptyStageCounts();
  const dispatchBreakdown: Record<DispatchKey, number> = {
    not_dispatched: 0, dispatched: 0, home: 0, truck_down: 0,
  };
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  let onboarding = 0;
  let onHold = 0;
  let activeDrivers = 0;
  let alerts = 0;
  let idle = 0;

  for (const op of eligible) {
    const os = op.onboarding_status;
    const fullyOnboarded = os?.fully_onboarded === true;

    if (os?.mvr_ch_approval === 'denied' || os?.pe_screening_result === 'non_clear') alerts++;

    if (fullyOnboarded) {
      activeDrivers++;
      stageBreakdown.fully_onboarded++;
      const status = (op.active_dispatch?.dispatch_status ?? 'not_dispatched') as DispatchKey;
      if (status in dispatchBreakdown) dispatchBreakdown[status]++;
      else dispatchBreakdown.not_dispatched++;
      continue;
    }

    if (op.on_hold === true) {
      onHold++;
      continue;
    }

    onboarding++;
    stageBreakdown[getOnboardingStage(os)]++;
    if (os?.updated_at && os.updated_at < fourteenDaysAgo) idle++;
  }

  return {
    onboarding,
    onHold,
    activeDrivers,
    dispatched: dispatchBreakdown.dispatched,
    dispatchBreakdown,
    alerts,
    stageBreakdown,
    idle,
  };
}
