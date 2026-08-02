/**
 * §7 quarterly revoked-list reminder wording.
 *
 * The reminder fires at most once per model per 90 days, so its FREQUENCY
 * cannot escalate. A model that is never checked would otherwise get four
 * identical nudges a year, each indistinguishable from the first. The message
 * therefore carries the age and the exposure, so the text escalates even
 * though the cadence does not — the same shape as the malfunction rungs, and
 * far cheaper than a second escalation ladder.
 */

export interface StaleModel {
  id: string;
  provider_name: string;
  device_make: string;
  device_model: string;
  last_check_at: string | null;
  created_at: string;
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** 91–120 overdue, 121–270 well overdue, 271+/never no verification on record. */
export function ageBandPhrase(days: number, everChecked: boolean): string {
  if (!everChecked || days > 270) return 'no verification on record';
  if (days > 120) return 'well overdue';
  return 'overdue';
}

export function reminderText(m: StaleModel, trucks: number, now: Date): {
  title: string; body: string;
} {
  const everChecked = Boolean(m.last_check_at);
  const days = daysSince(m.last_check_at ?? m.created_at, now);
  const band = ageBandPhrase(days, everChecked);
  const truckPhrase = `${trucks} truck${trucks === 1 ? '' : 's'}`;

  const title = `Revoked-list check ${band} — ${m.device_make} ${m.device_model} `
    + `(${everChecked ? `unchecked ${days} days` : `never checked, added ${days} days ago`}, ${truckPhrase})`;

  const history = everChecked
    ? `Last verified ${new Date(m.last_check_at!).toISOString().slice(0, 10)} — ${days} days ago.`
    : `Never verified since it was added on ${new Date(m.created_at).toISOString().slice(0, 10)} — ${days} days ago.`;

  const body = `${m.provider_name} ${m.device_make} ${m.device_model}. ${history} `
    + `${truckPhrase} currently run this model. Under 49 CFR 395.8(a)(1) a device that is not `
    + `registered on FMCSA's list is an out-of-service finding at roadside, so this needs to be `
    + `caught here rather than at an inspection.`;

  return { title, body };
}