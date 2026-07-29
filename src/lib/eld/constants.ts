/**
 * ELD Malfunction Mode — shared constants.
 *
 * SUPERDRIVE is NOT an ELD and is not a logging device. These screens support
 * manual record-keeping while the driver's own registered ELD is malfunctioning
 * (49 CFR 395.34).
 */

export const CARRIER_LEGAL_NAME = 'SUPERTRANSPORT, LLC';
export const CARRIER_USDOT = '2309365';
export const CARRIER_MC = '788425';

export const MALFUNCTION_CODES = [
  { code: 'P', label: 'Power compliance', hint: 'The device lost power or did not turn on with the engine.' },
  { code: 'E', label: 'Engine synchronization', hint: 'The device stopped reading engine data (speed, miles, engine hours).' },
  { code: 'T', label: 'Timing compliance', hint: 'The device clock drifted from the correct time.' },
  { code: 'L', label: 'Positioning compliance', hint: 'The device stopped recording location.' },
  { code: 'R', label: 'Data recording compliance', hint: 'The device can no longer record or store records.' },
  { code: 'S', label: 'Data transfer compliance', hint: 'The device cannot transfer records to an officer.' },
  { code: 'O', label: 'Other', hint: 'Something else is wrong — describe it below.' },
] as const;

export type MalfunctionCode = (typeof MALFUNCTION_CODES)[number]['code'];

export const MALFUNCTION_CODE_LABEL: Record<string, string> = Object.fromEntries(
  MALFUNCTION_CODES.map((c) => [c.code, c.label]),
);

export const REPAIR_WINDOW_DAYS = 8;
export const MAX_BACKDATE_HOURS = 48;
export const MAX_SUPPRESSION_DAYS = 7;

/** Clock colors are intentionally inline hex per the ELD Malfunction spec. */
export const CLOCK_GOLD = '#C9A84C';
export const CLOCK_AMBER = '#E08A2E';
export const CLOCK_RED = '#C0392B';

export type NoticeDeliveryState = 'not_uploaded' | 'uploaded' | 'sent';

export function getNoticeDeliveryState(event: {
  notice_uploaded_at: string | null;
  notice_sent_at: string | null;
}): NoticeDeliveryState {
  if (event.notice_sent_at) return 'sent';
  if (event.notice_uploaded_at) return 'uploaded';
  return 'not_uploaded';
}

/** Driver-facing copy must never claim delivery that has not happened. */
export const NOTICE_DELIVERY_COPY: Record<NoticeDeliveryState, string> = {
  not_uploaded: 'Notice saved on this device — will send when you have signal',
  uploaded: 'Notice received by SUPERDRIVE — delivering to carrier',
  sent: 'Notice delivered to carrier',
};

export const NOTICE_DELIVERY_TONE: Record<NoticeDeliveryState, string> = {
  not_uploaded: CLOCK_AMBER,
  uploaded: CLOCK_GOLD,
  sent: '#2E7D4F',
};

/** Elapsed day of the 8-day repair window, 1-based. */
export function elapsedRepairDay(discoveredAt: string | Date, now: Date = new Date()): number {
  const start = typeof discoveredAt === 'string' ? new Date(discoveredAt) : discoveredAt;
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

export function repairClockColor(day: number): string {
  if (day >= 8) return CLOCK_RED;
  if (day >= 6) return CLOCK_AMBER;
  return CLOCK_GOLD;
}

export function currentQuarterKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}