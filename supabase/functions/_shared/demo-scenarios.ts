// Shared scenario presets for demo driver accounts.
//
// A scenario describes the onboarding_status snapshot a demo driver should be
// reset to, so staff can demo any point of the lifecycle on demand.

export const DEMO_SCENARIOS = [
  'blank',
  'new_applicant',
  'mid_onboarding',
  'fully_live',
  'offboarding',
] as const;

export type DemoScenario = typeof DEMO_SCENARIOS[number];

export function isDemoScenario(v: unknown): v is DemoScenario {
  return typeof v === 'string' && (DEMO_SCENARIOS as readonly string[]).includes(v);
}

export const SCENARIO_LABELS: Record<DemoScenario, string> = {
  blank: 'Blank',
  new_applicant: 'New applicant',
  mid_onboarding: 'Mid-onboarding',
  fully_live: 'Fully live',
  offboarding: 'Offboarding',
};

/** onboarding_status column values for each scenario. */
export function onboardingStatusForScenario(scenario: DemoScenario) {
  const today = new Date().toISOString().split('T')[0];

  const blank = {
    mvr_status: 'not_started',
    ch_status: 'not_started',
    mvr_ch_approval: 'pending',
    pe_screening: 'not_started',
    pe_screening_result: null,
    form_2290: 'not_started',
    truck_title: 'not_started',
    truck_photos: 'not_started',
    truck_inspection: 'not_started',
    ica_status: 'not_issued',
    mo_docs_submitted: 'not_submitted',
    mo_reg_received: 'not_yet',
    decal_applied: 'no',
    eld_installed: 'no',
    fuel_card_issued: 'no',
    insurance_added_date: null,
    go_live_date: null,
    fully_onboarded: false,
  };

  switch (scenario) {
    case 'blank':
    case 'new_applicant':
      return blank;

    case 'mid_onboarding':
      return {
        ...blank,
        mvr_status: 'received',
        ch_status: 'received',
        mvr_ch_approval: 'approved',
        pe_screening: 'results_in',
        pe_screening_result: 'clear',
        form_2290: 'received',
        truck_title: 'received',
        truck_photos: 'received',
        truck_inspection: 'received',
        ica_status: 'in_progress',
      };

    case 'fully_live':
    case 'offboarding':
      return {
        ...blank,
        mvr_status: 'received',
        ch_status: 'received',
        mvr_ch_approval: 'approved',
        pe_screening: 'results_in',
        pe_screening_result: 'clear',
        form_2290: 'received',
        truck_title: 'received',
        truck_photos: 'received',
        truck_inspection: 'received',
        ica_status: 'complete',
        mo_docs_submitted: 'submitted',
        mo_reg_received: 'yes',
        decal_applied: 'yes',
        eld_installed: 'yes',
        fuel_card_issued: 'yes',
        insurance_added_date: today,
        go_live_date: today,
        fully_onboarded: true,
      };
  }
}

/** Application review_status for each scenario. */
export function applicationStatusForScenario(scenario: DemoScenario) {
  if (scenario === 'blank') return { review_status: 'pending', is_draft: true };
  if (scenario === 'new_applicant') return { review_status: 'pending', is_draft: false };
  return { review_status: 'approved', is_draft: false };
}
