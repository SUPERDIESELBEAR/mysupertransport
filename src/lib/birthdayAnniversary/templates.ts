/**
 * Default staff-authored subject/body for the personalized birthday and
 * anniversary messages triggered from the management popup. Signed by the
 * sender so several teammates' messages never arrive as identical copies.
 */

export const BRAND_NAME = 'SUPERTRANSPORT';

export interface TemplateArgs {
  firstName: string;
  years?: number;
  /** The signed-in staff member writing the message. */
  senderName?: string;
}

export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function signOff(senderName?: string) {
  const name = senderName?.trim();
  return name ? `— ${name}, ${BRAND_NAME}` : `— The ${BRAND_NAME} Team`;
}

export function birthdayDefaults(args: TemplateArgs) {
  const name = args.firstName || 'Driver';
  return {
    subject: `Happy Birthday, ${name}! 🎂`,
    body:
      `Happy Birthday, ${name}!\n\n` +
      `Wishing you a very happy birthday. ` +
      `I appreciate everything you do and hope you have a wonderful day filled with joy and celebration.\n\n` +
      `Here's to another great year ahead!\n\n` +
      signOff(args.senderName),
  };
}

export function anniversaryDefaults(args: TemplateArgs) {
  const name = args.firstName || 'Driver';
  const years = args.years ?? 1;
  const yearLabel = `${ordinal(years)} anniversary`;
  return {
    subject: `Congratulations on your ${yearLabel} with ${BRAND_NAME}! 🎉`,
    body:
      `Happy Anniversary, ${name}!\n\n` +
      `Today marks your ${yearLabel} since you became an active operator with ${BRAND_NAME}. ` +
      `Your dedication, hard work, and commitment have been a vital part of our success. ` +
      `We're proud to have you on the team.\n\n` +
      `Here's to many more miles and milestones together!\n\n` +
      signOff(args.senderName),
  };
}
