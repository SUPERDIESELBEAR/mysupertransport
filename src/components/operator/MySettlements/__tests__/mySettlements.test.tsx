import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettlementList from '../SettlementList';
import type { DriverSettlement } from '../settlementView';
import { CLAIM_HOLD_DRIVER_MESSAGE } from '@/lib/settlementEngine';

/**
 * WHAT THE DRIVER MUST NOT SEE is the substance of this file. Gross linehaul,
 * the pay percentage, the departing flag and the nature of a claim are staff
 * facts; a rendered-output assertion is the only thing that proves they are
 * absent from HIS screen.
 */

const paid: DriverSettlement = {
  id: 's1',
  periodStart: '2026-08-19',
  periodEnd: '2026-08-25',
  payday: '2026-09-08',
  status: 'paid',
  netAmount: 1421.5,
  holdReason: null,
  lines: [
    { id: 'l1', lineType: 'load_pay', amount: 1620, description: 'Load ST-1042 — linehaul and fuel surcharge' },
    { id: 'l2', lineType: 'fuel_discount', amount: 41.5, description: 'Fuel discount passed through' },
    { id: 'l3', lineType: 'fuel', amount: -200, description: 'Fuel purchases' },
    { id: 'l4', lineType: 'rm_deposit', amount: -40, description: 'Repair & Maintenance Deposit' },
  ],
  withheld: [
    { id: 'w1', loadNumber: 'ST-1050', message: 'Paperwork outstanding.', outstanding: ['POD'] },
    { id: 'w2', loadNumber: 'ST-1051', message: CLAIM_HOLD_DRIVER_MESSAGE, outstanding: [] },
  ],
};

describe('driver settlement view', () => {
  it('leads with net pay and itemises every line', () => {
    render(<SettlementList settlements={[paid]} rmDeposit={{ currentBalance: 800, targetAmount: 2000 }} />);
    expect(screen.getByText('$1,421.50')).toBeTruthy();
    expect(screen.getByText(/Load ST-1042/)).toBeTruthy();
    expect(screen.getByText('Fuel discount passed through')).toBeTruthy();
    expect(screen.getByText('Fuel purchases')).toBeTruthy();
    expect(screen.getByText('PAID')).toBeTruthy();
  });

  it('shows the deposit by its legal name, never as escrow', () => {
    const { container } = render(
      <SettlementList settlements={[paid]} rmDeposit={{ currentBalance: 800, targetAmount: 2000 }} />,
    );
    expect(container.textContent).toContain('Repair & Maintenance Deposit');
    expect(container.textContent!.toLowerCase()).not.toContain('escrow');
  });

  it('renders the engine wording for withheld loads verbatim', () => {
    const { container } = render(<SettlementList settlements={[paid]} rmDeposit={null} />);
    expect(container.textContent).toContain('Paperwork outstanding.');
    expect(container.textContent).toContain(CLAIM_HOLD_DRIVER_MESSAGE);
    // The claim itself — its type, its level, the broker's complaint — is not his.
    expect(container.textContent!.toLowerCase()).not.toContain('damaged');
    expect(container.textContent!.toLowerCase()).not.toContain('claim');
  });

  it('never exposes gross linehaul, a pay percentage, or the departing flag', () => {
    const { container } = render(
      <SettlementList settlements={[paid]} rmDeposit={{ currentBalance: 800, targetAmount: 2000 }} />,
    );
    const text = container.textContent!.toLowerCase();
    expect(text).not.toContain('gross');
    expect(text).not.toContain('72%');
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toContain('departing');
  });

  it('below threshold says it rolls forward, and never says holdback', () => {
    const below: DriverSettlement = {
      ...paid, id: 's2', status: 'below_threshold', netAmount: 61.25, lines: [], withheld: [],
    };
    const { container } = render(<SettlementList settlements={[below]} rmDeposit={null} />);
    expect(container.textContent).toContain('BELOW MINIMUM');
    expect(container.textContent).toContain('$61.25 rolls into your next settlement.');
    expect(container.textContent!.toLowerCase()).not.toContain('holdback');
  });

  it('a held settlement is visible in full, with its reason', () => {
    const held: DriverSettlement = {
      ...paid,
      id: 's3',
      status: 'held',
      holdReason: 'Held pending return of company equipment.',
    };
    const { container } = render(<SettlementList settlements={[held]} rmDeposit={null} />);
    expect(container.textContent).toContain('HELD');
    expect(container.textContent).toContain('$1,421.50');
    expect(container.textContent).toContain('Held pending return of company equipment.');
    expect(container.textContent!.toLowerCase()).not.toContain('departing');
  });

  it('says plainly when there is nothing yet', () => {
    const { container } = render(<SettlementList settlements={[]} rmDeposit={null} />);
    expect(container.textContent).toContain('No settlements yet.');
  });
});
