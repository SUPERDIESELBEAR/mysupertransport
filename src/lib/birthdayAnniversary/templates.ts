/**
 * Default staff-authored subject/body for the personalized birthday and
 * anniversary messages triggered from the management popup. Mirrors the
 * tone of the automated `send-birthday-anniversary` templates so staff can
 * tweak instead of writing from scratch.
 */

export const BRAND_NAME = 'SUPERTRANSPORT';

export interface TemplateArgs {
  firstName: string;
  years?: number;
}

export function birthdayDefaults(args: TemplateArgs) {
  const name = args.firstName || 'Driver';
  return {
    subject: `Happy Birthday, ${name}! 🎂`,
    body:
      `Happy Birthday, ${name}!\n\n` +
      `The entire ${BRAND_NAME} family wants to wish you a very happy birthday. ` +
      `We appreciate everything you do and hope you have a wonderful day filled with joy and celebration.\n\n` +
      `Here's to another great year ahead!\n\n` +
      `— The ${BRAND_NAME} Team`,
  };
}

export function anniversaryDefaults(args: TemplateArgs) {
  const name = args.firstName || 'Driver';
  const years = args.years ?? 1;
  const yearLabel = years === 1 ? '1 year' : `${years} years`;
  return {
    subject: `Congratulations on ${yearLabel} with ${BRAND_NAME}! 🎉`,
    body:
      `Happy Anniversary, ${name}!\n\n` +
      `Today marks ${yearLabel} since you became an active operator with ${BRAND_NAME}. ` +
      `Your dedication, hard work, and commitment have been a vital part of our success. ` +
      `We're proud to have you on the team.\n\n` +
      `Here's to many more miles and milestones together!\n\n` +
      `— The ${BRAND_NAME} Team`,
  };
}