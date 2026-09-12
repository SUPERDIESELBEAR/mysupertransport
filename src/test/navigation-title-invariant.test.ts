import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

type Placement = { file: string; menu: RegExp; pageFile: string; title: RegExp };

// This is an invariant, not a census: every entry ties a routed menu label to
// the title rendered by that same page. Adding a placement requires adding its
// pair here; changing one side without the other fails.
const identicalPageNames: Placement[] = [
  { file: 'src/pages/staff/StaffPortal.tsx', menu: /label: 'Fleet Compliance'.*path: 'compliance'/, pageFile: 'src/pages/staff/StaffPortal.tsx', title: /Fleet Compliance<\/h1>/ },
  { file: 'src/pages/staff/StaffPortal.tsx', menu: /label: 'Onboard Systems'.*path: 'equipment'/, pageFile: 'src/components/equipment/EquipmentInventory.tsx', title: /Onboard Systems/ },
  { file: 'src/pages/dispatch/DispatchPortal.tsx', menu: /label: 'Driver Hub'.*path: 'dispatch-drivers'/, pageFile: 'src/components/drivers/DriverHubView.tsx', title: /Driver Hub/ },
  { file: 'src/pages/staff/StaffPortal.tsx', menu: /label: 'Onboarding Pipeline'.*path: 'pipeline'/, pageFile: 'src/pages/staff/PipelineDashboard.tsx', title: /Onboarding Pipeline/ },
  { file: 'src/pages/staff/StaffPortal.tsx', menu: /label: 'DOT Inspection Binder'.*path: 'inspection-binder'/, pageFile: 'src/components/inspection/InspectionBinderAdmin.tsx', title: /DOT Inspection Binder/ },
  { file: 'src/pages/management/ManagementPortal.tsx', menu: /label: 'PEI Q'.*path: 'pei-queue'/, pageFile: 'src/components/pei/PEIQueuePanel.tsx', title: /title="PEI Q"/ },
  { file: 'src/pages/staff/StaffPortal.tsx', menu: /label: 'PEI Q'.*path: 'pei-queue'/, pageFile: 'src/components/pei/PEIQueuePanel.tsx', title: /title="PEI Q"/ },
  { file: 'src/pages/management/ManagementPortal.tsx', menu: /label: 'Overview'.*path: 'overview'/, pageFile: 'src/pages/management/ManagementPortal.tsx', title: /title="Overview"/ },
  { file: 'src/pages/management/ManagementPortal.tsx', menu: /label: 'Device Models'.*path: 'eld-device-models'/, pageFile: 'src/components/management/eld/ELDDeviceModelsPanel.tsx', title: /title="Device Models"/ },
  { file: 'src/pages/operator/OperatorPortal.tsx', menu: /label: 'Document Hub'.*view: 'docs-hub'|view: 'docs-hub'.*label: 'Document Hub'/, pageFile: 'src/components/documents/DocumentHub.tsx', title: /Document Hub/ },
  { file: 'src/pages/operator/OperatorPortal.tsx', menu: /view: 'pay-setup'.*label: 'Pay Setup'/, pageFile: 'src/pages/operator/OperatorPortal.tsx', title: /title="Pay Setup"/ },
  { file: 'src/pages/operator/OperatorPortal.tsx', menu: /view: 'dispatch'.*label: 'Dispatch'/, pageFile: 'src/components/operator/OperatorDispatchStatus.tsx', title: /title="Dispatch"/ },
];

const deliberateExceptions = [
  { menu: 'FAQ', title: 'Frequently Asked Questions', reason: 'The expanded page title is clearer than the compact menu label.' },
  { menu: 'My Truck', title: 'Unit {n}', reason: 'A driver benefits more from seeing the assigned unit number.' },
] as const;

describe('routed page titles match their menu labels', () => {
  it.each(identicalPageNames)('$file menu agrees with $pageFile', ({ file, menu, pageFile, title }) => {
    expect(read(file)).toMatch(menu);
    expect(read(pageFile)).toMatch(title);
  });

  it('keeps only the two reasoned owner-approved exceptions', () => {
    expect(deliberateExceptions).toEqual([
      expect.objectContaining({ menu: 'FAQ', title: 'Frequently Asked Questions', reason: expect.any(String) }),
      expect.objectContaining({ menu: 'My Truck', title: 'Unit {n}', reason: expect.any(String) }),
    ]);
  });
});