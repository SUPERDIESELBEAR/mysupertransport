import { createRoot } from 'react-dom/client';
import '@/index.css';
import SettlementList from '@/components/operator/MySettlements/SettlementList';
import { CLAIM_HOLD_DRIVER_MESSAGE } from '@/lib/settlementEngine';

const settlements = [
  {
    id: 's1', periodStart: '2026-08-19', periodEnd: '2026-08-25', payday: '2026-09-08',
    status: 'paid' as const, netAmount: 1421.5, holdReason: null,
    lines: [
      { id: 'l1', lineType: 'load_pay', amount: 1620, description: 'Load ST-1042 — linehaul and fuel surcharge' },
      { id: 'l2', lineType: 'fuel_discount', amount: 41.5, description: 'Fuel discount passed through' },
      { id: 'l3', lineType: 'fuel', amount: -200, description: 'Fuel purchases' },
      { id: 'l4', lineType: 'rm_deposit', amount: -40, description: 'Repair & Maintenance Deposit' },
    ],
    withheld: [
      { id: 'w1', loadNumber: 'ST-1050', message: 'Paperwork outstanding.', outstanding: ['POD', 'Scale ticket'] },
      { id: 'w2', loadNumber: 'ST-1051', message: CLAIM_HOLD_DRIVER_MESSAGE, outstanding: [] },
    ],
  },
  {
    id: 's2', periodStart: '2026-08-12', periodEnd: '2026-08-18', payday: '2026-09-01',
    status: 'below_threshold' as const, netAmount: 61.25, holdReason: null, lines: [], withheld: [],
  },
];

createRoot(document.getElementById('root')!).render(
  <div className="max-w-md mx-auto p-3">
    <SettlementList settlements={settlements as any} rmDeposit={{ currentBalance: 800, targetAmount: 2000 }} />
  </div>,
);
