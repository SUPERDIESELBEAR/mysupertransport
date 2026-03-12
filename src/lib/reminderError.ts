import React from 'react';

/**
 * Returns a user-friendly title + description for cert reminder send failures.
 * Detects Resend "domain not verified" errors and surfaces an actionable message.
 * The description may be a React node containing a clickable link.
 */
export function reminderErrorToast(err: unknown): { title: string; description: React.ReactNode } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('domain is not verified') || msg.includes('validation_error')) {
    return {
      title: 'Email domain not verified',
      description: React.createElement(
        'span',
        null,
        'The mysupertransport.com domain hasn\'t been verified with Resend yet. ',
        React.createElement(
          'a',
          {
            href: 'https://resend.com/domains',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'underline font-medium hover:opacity-80',
          },
          'Verify DNS records →'
        ),
      ),
    };
  }
  return {
    title: 'Failed to send reminder',
    description: msg || 'An unexpected error occurred.',
  };
}
