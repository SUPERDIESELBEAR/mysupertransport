/**
 * Single source of truth for onboarding stage completion.
 *
 * Every progress readout on the operator detail page (sticky header bar,
 * top completion summary, Onboarding Progress card, dot strips) must derive
 * its stages from this helper so the percentages can never disagree.
 *
 * Canonical rules:
 *  - 9 stages, always, including Contractor Pay Setup.
 *  - MO Registration counts as COMPLETE when the operator runs on their own
 *    registration (nothing further is required of them).
 *  - Onboard Systems completion stays strict (decal + ELD + fuel card); the
 *    temp-decal / paper-logbook allowance only sets the `exception` flag used
 *    for styling.
 */

export type OnboardingStageItem = { label: string; done: boolean };

export type OnboardingStage = {
  key: string;
  /** Long label, e.g. "Background" */
  label: string;
  /** Compact label used in pill/dot strips, e.g. "BG" */
  shortLabel: string;
  /** Descriptive name used in tooltips */
  fullName: string;
  complete: boolean;
  /** True when the stage is satisfied because it does not apply to this operator */
  notApplicable?: boolean;
  /** True when an approved exception is covering an otherwise incomplete stage */
  exception?: boolean;
  items: OnboardingStageItem[];
};

export function getOnboardingStages(status: any, paySetupRecord?: any): OnboardingStage[] {
  const s = status ?? {};
  const exceptionActive = !!(s.paper_logbook_approved || s.temp_decal_approved);
  const allEquipFull =
    s.decal_applied === 'yes' && s.eld_installed === 'yes' && s.fuel_card_issued === 'yes';
  const moNa = s.registration_status === 'own_registration';
  const payComplete = !!(paySetupRecord?.submitted_at && paySetupRecord?.terms_accepted);

  return [
    {
      key: 'stage1', label: 'Background', shortLabel: 'BG', fullName: 'Background Check',
      complete: s.mvr_ch_approval === 'approved',
      items: [
        { label: 'MVR Check Requested', done: s.mvr_status === 'requested' || s.mvr_status === 'received' },
        { label: 'Clearinghouse Requested', done: s.ch_status === 'requested' || s.ch_status === 'received' },
        { label: 'MVR & CH Approved', done: s.mvr_ch_approval === 'approved' },
      ],
    },
    {
      key: 'stage2', label: 'Documents', shortLabel: 'Docs', fullName: 'Documents',
      complete:
        s.form_2290 === 'received' && s.truck_title === 'received' &&
        s.truck_photos === 'received' && s.truck_inspection === 'received',
      items: [
        { label: 'Form 2290', done: s.form_2290 === 'received' },
        { label: 'Truck Title', done: s.truck_title === 'received' },
        { label: 'Truck Photos', done: s.truck_photos === 'received' },
        { label: 'Truck Inspection', done: s.truck_inspection === 'received' },
      ],
    },
    {
      key: 'stage3', label: 'ICA', shortLabel: 'ICA', fullName: 'ICA Contract',
      complete: s.ica_status === 'complete',
      items: [
        { label: 'ICA Issued', done: s.ica_status !== 'not_issued' },
        { label: 'ICA Signed', done: s.ica_status === 'complete' },
      ],
    },
    {
      key: 'stage4', label: 'MO Reg', shortLabel: 'MO', fullName: 'MO Registration',
      complete: moNa || s.mo_reg_received === 'yes',
      notApplicable: moNa,
      items: moNa
        ? [{ label: 'N/A — operator has own registration', done: true }]
        : [
            { label: 'MO Docs Submitted', done: s.mo_docs_submitted === 'submitted' },
            { label: 'MO Registration Received', done: s.mo_reg_received === 'yes' },
          ],
    },
    {
      key: 'stage5', label: 'Onboard Systems', shortLabel: 'Systems', fullName: 'Onboard Systems',
      complete: allEquipFull,
      exception: exceptionActive && !allEquipFull,
      items: [
        { label: 'Decal Applied', done: s.decal_applied === 'yes' || !!(s.temp_decal_approved && s.decal_method === 'supertransport_shop') },
        { label: 'ELD Installed', done: s.eld_installed === 'yes' || !!(s.paper_logbook_approved && s.eld_method === 'supertransport_shop') },
        { label: 'Fuel Card Issued', done: s.fuel_card_issued === 'yes' },
      ],
    },
    {
      key: 'stagePE', label: 'PE', shortLabel: 'PE', fullName: 'Pre-Employment Screening',
      complete: s.pe_screening_result === 'clear',
      items: [
        { label: 'PE Scheduled', done: s.pe_screening === 'scheduled' || s.pe_screening === 'results_in' },
        { label: 'PE Screening Clear', done: s.pe_screening_result === 'clear' },
      ],
    },
    {
      key: 'stage6', label: 'Insurance', shortLabel: 'Ins', fullName: 'Insurance',
      complete: !!s.insurance_added_date,
      items: [{ label: 'Insurance Added', done: !!s.insurance_added_date }],
    },
    {
      key: 'stage7', label: 'Go Live', shortLabel: 'Live', fullName: 'Go Live & Dispatch Readiness',
      complete: !!s.go_live_date,
      items: [{ label: 'Go-Live Date Set', done: !!s.go_live_date }],
    },
    {
      key: 'stage8', label: 'Pay', shortLabel: 'Pay', fullName: 'Contractor Pay Setup',
      complete: payComplete,
      items: [
        { label: 'Docs Acknowledged', done: !!(paySetupRecord?.deposit_overview_acknowledged && paySetupRecord?.payroll_calendar_acknowledged) },
        { label: 'Pay Setup Submitted', done: payComplete },
      ],
    },
  ];
}

export function getOnboardingProgress(status: any, paySetupRecord?: any) {
  const stages = getOnboardingStages(status, paySetupRecord);
  const completedCount = stages.filter(s => s.complete).length;
  const pct = Math.round((completedCount / stages.length) * 100);
  return { stages, completedCount, total: stages.length, pct, allDone: completedCount === stages.length };
}
