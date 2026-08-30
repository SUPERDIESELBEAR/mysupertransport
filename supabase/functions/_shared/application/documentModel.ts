/**
 * The printed driver application, defined ONCE as data.
 *
 * The React print view and the server-side PDF renderer both consume this
 * model. Neither owns the wording, neither owns the ordering, and neither can
 * quietly diverge from the other — a section added here appears in both, or in
 * neither.
 *
 * No imports outside this folder: this module runs unchanged in Deno (edge
 * function) and in the browser bundle.
 */
import * as C from './copy.ts';

export type DocBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'notice'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'field'; label: string; value: string }
  | { kind: 'qa'; question: string; answer: string }
  | { kind: 'record'; title: string; fields: { label: string; value: string }[] }
  | { kind: 'signature'; printedName: string; date: string };

export interface DocSection {
  title: string;
  blocks: DocBlock[];
}

export interface ApplicationDocument {
  title: string;
  applicantName: string;
  sections: DocSection[];
  /** Set when the applicant's drawn signature should be embedded. */
  hasSignatureImage: boolean;
}

export interface EmployerRecord {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  position?: string | null;
  reason_leaving?: string | null;
  cmv_position?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  email?: string | null;
}

/** Loose shape — the applications row, as read by staff or by the renderer. */
export interface ApplicationRow {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_duration?: string | null;
  prev_address_street?: string | null;
  prev_address_line2?: string | null;
  prev_address_city?: string | null;
  prev_address_state?: string | null;
  prev_address_zip?: string | null;
  cdl_state?: string | null;
  cdl_number?: string | null;
  cdl_class?: string | null;
  cdl_expiration?: string | null;
  endorsements?: string[] | null;
  cdl_10_years?: string | null;
  referral_source?: string | null;
  employers?: unknown;
  employment_gaps?: string | null;
  employment_gaps_explanation?: string | null;
  years_experience?: string | null;
  equipment_operated?: string[] | null;
  dot_accidents?: string | null;
  dot_accidents_description?: string | null;
  moving_violations?: string | null;
  moving_violations_description?: string | null;
  sap_process?: string | null;
  dot_positive_test_past_2yr?: string | null;
  dot_return_to_duty_docs?: string | null;
  auth_safety_history?: boolean | null;
  auth_drug_alcohol?: boolean | null;
  auth_previous_employers?: boolean | null;
  testing_policy_accepted?: boolean | null;
  medical_cert_expiration?: string | null;
  dl_front_url?: string | null;
  dl_rear_url?: string | null;
  medical_cert_url?: string | null;
  typed_full_name?: string | null;
  signature_image_url?: string | null;
  signed_date?: string | null;
  submitted_at?: string | null;
  submitted_by_staff?: boolean | null;
}

const NP = C.NOT_PROVIDED;

export function textOrBlank(v: unknown): string {
  if (v === null || v === undefined) return NP;
  const s = String(v).trim();
  return s === '' ? NP : s;
}

/** yes/no strings from the form → the word the applicant chose. */
export function yesNo(v: unknown): string {
  if (v === null || v === undefined || v === '') return NP;
  const s = String(v).trim().toLowerCase();
  if (['yes', 'true', 'y', '1'].includes(s)) return 'Yes';
  if (['no', 'false', 'n', '0'].includes(s)) return 'No';
  return String(v);
}

/** Checkbox acknowledgments — the honest three states. */
export function acknowledged(v: boolean | null | undefined): string {
  if (v === true) return 'Yes — acknowledged and authorized';
  if (v === false) return 'No — not acknowledged';
  return NP;
}

/** YYYY-MM-DD is anchored at noon so the printed date never slips a day. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return NP;
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return NP;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function fmtPhone(s: string | null | undefined): string {
  if (!s) return NP;
  const digits = String(s).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(s);
}

function joinParts(parts: (string | null | undefined)[], sep = ', '): string {
  const s = parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
  return s || NP;
}

export function applicantName(a: ApplicationRow): string {
  const n = [a.first_name, a.last_name].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
  return n || (a.email ?? '').trim() || 'Applicant';
}

function docLine(path: string | null | undefined): string {
  return path ? 'On file' : 'Not uploaded';
}

/**
 * Employment dates are captured as month precision. Print them as MM/YYYY,
 * the format used everywhere else the employment history is shown.
 */
function monthYear(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  const m = v.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[2]}/${m[1]}`;
  const m2 = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[1].padStart(2, '0')}/${m2[2]}`;
  return v;
}

export function buildApplicationDocument(a: ApplicationRow): ApplicationDocument {
  const employers: EmployerRecord[] = Array.isArray(a.employers) ? (a.employers as EmployerRecord[]) : [];
  const endorsements = Array.isArray(a.endorsements) ? a.endorsements.filter(Boolean) : [];
  const equipment = Array.isArray(a.equipment_operated) ? a.equipment_operated.filter(Boolean) : [];
  const name = applicantName(a);

  const sections: DocSection[] = [];

  sections.push({
    title: C.SECTION_TITLES.personal,
    blocks: [
      { kind: 'field', label: 'Full name', value: name },
      { kind: 'field', label: 'Email address', value: textOrBlank(a.email) },
      { kind: 'field', label: 'Phone number', value: fmtPhone(a.phone) },
      { kind: 'field', label: 'Date of birth', value: fmtDate(a.dob) },
      {
        kind: 'field',
        label: 'Current residence address',
        value: joinParts([a.address_street, a.address_line2, a.address_city, a.address_state, a.address_zip]),
      },
      { kind: 'field', label: 'Length of time at current address', value: textOrBlank(a.address_duration) },
      {
        kind: 'field',
        label: 'Previous residence address',
        value: joinParts([
          a.prev_address_street, a.prev_address_line2, a.prev_address_city,
          a.prev_address_state, a.prev_address_zip,
        ]),
      },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.cdl,
    blocks: [
      { kind: 'field', label: 'State of issue', value: textOrBlank(a.cdl_state) },
      { kind: 'field', label: 'License number', value: textOrBlank(a.cdl_number) },
      { kind: 'field', label: 'Class', value: textOrBlank(a.cdl_class) },
      { kind: 'field', label: 'Expiration date', value: fmtDate(a.cdl_expiration) },
      { kind: 'field', label: 'Endorsements', value: endorsements.length ? endorsements.join(', ') : 'None' },
      { kind: 'qa', question: C.CDL_10_YEARS_QUESTION, answer: yesNo(a.cdl_10_years) },
      { kind: 'field', label: 'How the applicant heard about SUPERTRANSPORT', value: textOrBlank(a.referral_source) },
    ],
  });

  const employmentBlocks: DocBlock[] = [{ kind: 'paragraph', text: C.EMPLOYMENT_INTRO }];
  if (employers.length === 0) {
    employmentBlocks.push({ kind: 'paragraph', text: 'No previous employers were listed on this application.' });
  } else {
    employers.forEach((e, i) => {
      employmentBlocks.push({
        kind: 'record',
        title: `Employer ${i + 1} of ${employers.length}`,
        fields: [
          { label: 'Employer name', value: textOrBlank(e.name) },
          { label: 'Location', value: joinParts([e.city, e.state]) },
          { label: 'Position held', value: textOrBlank(e.position) },
          { label: 'Dates of employment', value: joinParts([e.start_date, e.end_date], ' to ') },
          { label: 'Operated a commercial motor vehicle', value: yesNo(e.cmv_position) },
          { label: 'Employer contact email', value: textOrBlank(e.email) },
          { label: 'Reason for leaving', value: textOrBlank(e.reason_leaving) },
        ],
      });
    });
  }
  employmentBlocks.push({ kind: 'qa', question: C.EMPLOYMENT_GAPS_QUESTION, answer: yesNo(a.employment_gaps) });
  employmentBlocks.push({
    kind: 'field',
    label: C.EMPLOYMENT_GAPS_EXPLANATION_LABEL,
    value: textOrBlank(a.employment_gaps_explanation),
  });
  sections.push({ title: C.SECTION_TITLES.employment, blocks: employmentBlocks });

  sections.push({
    title: C.SECTION_TITLES.driving,
    blocks: [
      { kind: 'paragraph', text: C.DRIVING_EXPERIENCE_INTRO },
      { kind: 'field', label: 'Years of commercial driving experience', value: textOrBlank(a.years_experience) },
      { kind: 'field', label: 'Equipment operated', value: equipment.length ? equipment.join(', ') : NP },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.accidents,
    blocks: [
      { kind: 'paragraph', text: C.ACCIDENTS_INTRO },
      { kind: 'qa', question: C.ACCIDENTS_QUESTION, answer: yesNo(a.dot_accidents) },
      { kind: 'field', label: 'Accident details provided by the applicant', value: textOrBlank(a.dot_accidents_description) },
      { kind: 'qa', question: C.VIOLATIONS_QUESTION, answer: yesNo(a.moving_violations) },
      { kind: 'field', label: 'Violation details provided by the applicant', value: textOrBlank(a.moving_violations_description) },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.drugAlcohol,
    blocks: [
      { kind: 'notice', text: C.DOT_40_25_J_NOTICE },
      { kind: 'qa', question: C.DOT_POSITIVE_TEST_QUESTION, answer: yesNo(a.dot_positive_test_past_2yr) },
      { kind: 'qa', question: C.DOT_RETURN_TO_DUTY_QUESTION, answer: yesNo(a.dot_return_to_duty_docs) },
      { kind: 'qa', question: C.SAP_PROCESS_QUESTION, answer: yesNo(a.sap_process) },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.documents,
    blocks: [
      { kind: 'field', label: "Driver's License — Front", value: docLine(a.dl_front_url) },
      { kind: 'field', label: "Driver's License — Rear", value: docLine(a.dl_rear_url) },
      { kind: 'field', label: 'Medical Examiner’s Certificate', value: docLine(a.medical_cert_url) },
      { kind: 'field', label: 'Medical certificate expiration', value: fmtDate(a.medical_cert_expiration) },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.disclosures,
    blocks: [
      { kind: 'subheading', text: C.FCRA_HEADING },
      { kind: 'paragraph', text: C.FCRA_DISCLOSURE },
      { kind: 'subheading', text: C.PSP_HEADING },
      { kind: 'paragraph', text: C.PSP_DISCLOSURE_TITLE },
      ...C.PSP_DISCLOSURE_PARAGRAPHS.map((text): DocBlock => ({ kind: 'paragraph', text })),
      { kind: 'qa', question: C.AUTH_SAFETY_HISTORY, answer: acknowledged(a.auth_safety_history) },
      { kind: 'qa', question: C.AUTH_DRUG_ALCOHOL, answer: acknowledged(a.auth_drug_alcohol) },
      { kind: 'qa', question: C.AUTH_PREVIOUS_EMPLOYERS, answer: acknowledged(a.auth_previous_employers) },
      { kind: 'subheading', text: C.TESTING_POLICY_HEADING },
      { kind: 'paragraph', text: C.TESTING_POLICY_TITLE },
      ...C.TESTING_POLICY_PARAGRAPHS.map((text): DocBlock => ({ kind: 'paragraph', text })),
      { kind: 'qa', question: C.TESTING_POLICY_ACCEPTANCE, answer: acknowledged(a.testing_policy_accepted) },
    ],
  });

  sections.push({
    title: C.SECTION_TITLES.signature,
    blocks: [
      { kind: 'paragraph', text: C.SIGNATURE_CERTIFICATION },
      { kind: 'field', label: 'Typed full name', value: textOrBlank(a.typed_full_name) },
      { kind: 'field', label: 'Date signed', value: fmtDate(a.signed_date) },
      { kind: 'field', label: 'Submitted', value: fmtDateTime(a.submitted_at) },
      {
        kind: 'field',
        label: 'Submission source',
        value: a.submitted_by_staff ? 'Staff-assisted submission' : 'Driver self-submitted',
      },
      {
        kind: 'signature',
        printedName: textOrBlank(a.typed_full_name) === NP ? name : String(a.typed_full_name),
        date: fmtDate(a.signed_date),
      },
    ],
  });

  return {
    title: C.APPLICATION_TITLE,
    applicantName: name,
    sections,
    hasSignatureImage: Boolean(a.signature_image_url),
  };
}

/** `Driver-Application_Last-First_2026-08-30.pdf` */
export function applicationPdfFilename(a: ApplicationRow, now = new Date()): string {
  const safe = (v: string) => v.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Applicant';
  const last = safe(String(a.last_name ?? ''));
  const first = safe(String(a.first_name ?? ''));
  const stamp = now.toISOString().slice(0, 10);
  return `Driver-Application_${last}-${first}_${stamp}.pdf`;
}
