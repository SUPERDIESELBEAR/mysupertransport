// Full legal body of the SUPERTRANSPORT Passenger Authorization and Release
// of Liability. Rendered verbatim in the on-screen viewer and in the
// generated PDF so the driver and passenger see and file identical text.

export const AUTH_TITLE = 'PASSENGER AUTHORIZATION AND RELEASE OF LIABILITY';
export const AUTH_SUBTITLE =
  'Issued Under 49 CFR §392.60 — Supplement to the Independent Contractor Agreement';

export const AUTH_PREAMBLE =
  'READ CAREFULLY BEFORE SIGNING. This document contains a voluntary assumption of risk, releases of liability, and indemnification obligations. Under 49 CFR §392.60, no person may be transported on a commercial motor vehicle operated under SUPERTRANSPORT authority without this written authorization. A signed copy must be in the vehicle at all times the Passenger is present.';

export type Section = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const AUTH_SECTIONS: Section[] = [
  {
    heading: '1. AUTHORIZATION (49 CFR §392.60 Required Terms)',
    paragraphs: [
      'SUPERTRANSPORT, LLC d/b/a SUPERTRANSPORT ("SUPERTRANSPORT") authorizes the person named below ("Passenger") to be transported as the sole passenger in the equipment identified below, operated by the Contractor or Contractor\u2019s qualified driver named below ("Contractor") under SUPERTRANSPORT\u2019s motor carrier authority, subject to every term of this document.',
      'This authorization is trip- and date-specific, applies only to the Passenger, Contractor, and unit identified above, and automatically expires on the expiration date. SUPERTRANSPORT may revoke this authorization at any time, for any reason, with or without notice.',
    ],
  },
  {
    heading: '2. PASSENGER ELIGIBILITY AND CONDITIONS',
    bullets: [
      'Passenger must be at least 12 years of age. A Passenger under 18 requires the signature of a parent or legal guardian below, and the Contractor must be the Passenger\u2019s parent or legal guardian.',
      'Only one (1) passenger is permitted at any time. Persons holding a commercial driver\u2019s license may not ride as passengers. Hitchhikers are prohibited.',
      'Passenger is prohibited from operating the tractor or trailer (collectively, "Equipment") and from performing any labor, loading, unloading, fueling, repair, or other duties associated with the Equipment or any load, at any time, for any reason.',
      'Passenger may not enter any loading, unloading, fueling, or vehicle maintenance area, and must comply with all posted rules at any shipper, consignee, or other facility.',
      'Passenger must wear a seat belt at all times the vehicle is in motion.',
      'Passenger represents and warrants that Passenger is not pregnant, is not receiving treatment for illness, and is not under a physician\u2019s care for any physical, mental, or other health condition that would make riding in a commercial motor vehicle unsafe.',
      'Transporting a passenger without this signed authorization in the vehicle is a material breach of the Independent Contractor Agreement ("ICA") and grounds for immediate termination of the ICA.',
    ],
  },
  {
    heading: '3. ACKNOWLEDGMENT — NO PASSENGER INSURANCE PROVIDED',
    paragraphs: [
      'SUPERTRANSPORT does not purchase, provide, or make available any passenger accident, medical, life, or other insurance coverage for the Passenger. Passenger and Contractor acknowledge that any insurance protecting the Passenger, if desired, must be obtained by the Passenger or Contractor at their own expense, and that no representation of coverage has been made by SUPERTRANSPORT or any of its representatives.',
    ],
  },
  {
    heading: '4. PASSENGER\u2019S VOLUNTARY ASSUMPTION OF RISK',
    paragraphs: [
      'Passenger (or Passenger\u2019s parent or legal guardian, if Passenger is under 18) specifically acknowledges that serious personal injuries and deaths frequently occur to passengers in commercial motor vehicles, including from motor vehicle collisions and from entering or exiting the Equipment.',
      '"I acknowledge that I am voluntarily exposing myself, or my minor child, to these and similar risks in exchange for authorization to ride as a passenger in Equipment operated under SUPERTRANSPORT authority, and I certify the Passenger will wear a seat belt at all times the vehicle is in motion."',
    ],
  },
  {
    heading: '5. CONTRACTOR\u2019S RELEASE AND INDEMNIFICATION',
    paragraphs: [
      'In consideration of SUPERTRANSPORT\u2019s authorization for the Passenger to ride in the Equipment, Contractor, to the fullest extent permitted by law, releases and forever discharges SUPERTRANSPORT and its insurers, affiliates, members, managers, officers, employees, agents, and successors (the "Released Parties") from any and all claims, liabilities, rights, actions, and demands of every kind, in law or in equity, known or unknown, that Contractor may have now or in the future arising out of or relating to the Passenger\u2019s presence in or around the Equipment during the authorized period, including any claim for loss of companionship, affection, or consortium.',
      'Contractor further agrees, to the fullest extent permitted by law, to defend, indemnify, and hold harmless the Released Parties from and against any and all claims, damages, losses, judgments, settlements, costs, and expenses (including reasonable attorneys\u2019 fees) asserted by or on behalf of the Passenger, the Passenger\u2019s estate or family members, or any third party, arising out of or relating to the Passenger\u2019s presence in or around the Equipment. This signed release may be pleaded by any Released Party as a counterclaim to, or as a complete defense in bar or abatement of, any action brought by or on behalf of Contractor.',
    ],
  },
  {
    heading: '6. PASSENGER\u2019S / PARENT\u2019S / GUARDIAN\u2019S RELEASE AND INDEMNIFICATION',
    paragraphs: [
      'In consideration of SUPERTRANSPORT\u2019s authorization, the sufficiency of which is acknowledged, Passenger — or Passenger\u2019s parent or legal guardian if Passenger is under 18 — to the fullest extent permitted by law, releases and forever discharges the Released Parties from any and all claims, liabilities, rights, actions, and demands of every kind, in law or in equity, known or unknown, arising out of or relating to the authorized transportation. If Passenger is under 18, the undersigned parent or legal guardian additionally agrees, to the fullest extent permitted by law, to defend, indemnify, and hold harmless the Released Parties from and against any claim brought by or on behalf of the minor Passenger arising out of the authorized transportation. This signed release may be pleaded by any Released Party as a counterclaim to, or as a complete defense in bar or abatement of, any action brought by or on behalf of Passenger.',
    ],
  },
  {
    heading: '7. GENERAL PROVISIONS',
    paragraphs: [
      'Nothing in this document releases liability that cannot be released as a matter of law. If any provision of this document is held unenforceable, that provision shall be enforced to the maximum extent permitted, and all remaining provisions shall remain in full force. This document is governed by the laws of the State of Missouri, without regard to conflict-of-law principles. This document is incorporated into and made a part of the Contractor\u2019s ICA with SUPERTRANSPORT; nothing herein creates an employment relationship between SUPERTRANSPORT and the Contractor, any driver, or the Passenger. This document constitutes the entire agreement regarding passenger authorization and supersedes all prior passenger authorization forms.',
    ],
  },
];

export const AUTH_FOOTER =
  'SUPERTRANSPORT | positive. thinking. transport. | www.mysupertransport.com | (833) 337-8737';
export const AUTH_RETENTION_NOTE =
  'Retain original in the Contractor\u2019s qualification file. Copy must remain in the vehicle for the duration of the authorization.';

// Adds one calendar year to a YYYY-MM-DD date, rolling Feb 29 back to Feb 28.
// Returns YYYY-MM-DD.
export function addOneYear(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y + 1, m - 1, d, 12, 0, 0);
  // Handle Feb 29 rolling to Mar 1 -> pull back to Feb 28
  if (target.getMonth() !== m - 1) {
    target.setDate(0); // last day of previous month
  }
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}