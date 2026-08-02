/**
 * Console-side delivery state for the 395.34(a)(1) written notice.
 *
 * Four states, not three. "Never attempted" and "attempted and failing" are the
 * two the driver-facing copy collapses together, and they are the two staff
 * must be able to tell apart: one needs waiting, the other needs a person.
 */
export type ConsoleDeliveryState = 'not_generated' | 'generated' | 'uploaded' | 'failing' | 'sent';

export interface DeliveryFields {
  notice_generated_at: string | null;
  notice_uploaded_at: string | null;
  notice_sent_at: string | null;
  notice_send_attempts: number | null;
  notice_last_send_error: string | null;
}

export function getConsoleDeliveryState(e: DeliveryFields): ConsoleDeliveryState {
  if (e.notice_sent_at) return 'sent';
  if ((e.notice_send_attempts ?? 0) > 0) return 'failing';
  if (e.notice_uploaded_at) return 'uploaded';
  if (e.notice_generated_at) return 'generated';
  return 'not_generated';
}

export const CONSOLE_DELIVERY_COPY: Record<ConsoleDeliveryState, string> = {
  not_generated: 'Notice not generated',
  generated: 'Notice generated on the driver device',
  uploaded: 'Notice uploaded — not yet sent',
  failing: 'Failing to send',
  sent: 'Notice delivered to carrier',
};

export const CONSOLE_DELIVERY_TONE: Record<ConsoleDeliveryState, string> = {
  not_generated: '#8A8A8A',
  generated: '#C9A84C',
  uploaded: '#C9A84C',
  failing: '#C0392B',
  sent: '#2E7D4F',
};