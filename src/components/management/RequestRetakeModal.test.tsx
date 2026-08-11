import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { RequestRetakeModal } from './RequestRetakeModal';
import { RETAKE_REASONS } from '@/lib/applicationDocumentRetake';

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="portal-root">{children}</div>;
};

describe('RequestRetakeModal', () => {
  it('renders all retake reasons in the dropdown', () => {
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

    // Open the reason dropdown for the initially selected document
    const trigger = screen.getByRole('combobox', { name: /reason/i });
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    expect(options).toHaveLength(RETAKE_REASONS.length);
    for (const { label } of RETAKE_REASONS) {
      expect(within(listbox).getByRole('option', { name: label })).toBeInTheDocument();
    }
  });
});

