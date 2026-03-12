/**
 * Returns a user-friendly title + description for cert reminder send failures.
 * Detects Resend "domain not verified" errors and surfaces an actionable message.
 */
export function reminderErrorToast(err: unknown): { title: string; description: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('domain is not verified') || msg.includes('validation_error')) {
    return {
      title: 'Email domain not verified',
      description:
        'The mysupertransport.com domain hasn\'t been verified with Resend yet. Verify DNS records at resend.com/domains, then retry.',
    };
  }
  return {
    title: 'Failed to send reminder',
    description: msg || 'An unexpected error occurred.',
  };
}
