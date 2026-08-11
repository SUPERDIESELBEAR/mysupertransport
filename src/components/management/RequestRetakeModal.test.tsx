import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestRetakeModal } from './RequestRetakeModal';
import { RETAKE_REASONS } from '@/lib/applicationDocumentRetake';

// Minimal portal container helper so the modal renders in jsdom
const Wrapper = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="portal-root">{children}</div>;
};

describe('RequestRetakeModal', () => {
  it('renders all retake reasons in the dropdown', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <RequestRetakeModal
          applicationId="app-123"
          applicantEmail="test@example.com"
          initialKey="medical_cert_url"
          onClose={() => {}}
          onRequested={() => {}}
        />
      </Wrapper>
    );

    // Open the reason dropdown for Medical Certificate
    const trigger = screen.getByRole('combobox', { name: /reason/i });
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    expect(options).toHaveLength(RETAKE_REASONS.length);
    for (const { label } of RETAKE_REASONS) {
      expect(within(listbox).getByRole('option', { name: label })).toBeInTheDocument();
    }
  });
});
