/**
 * Field catalog for staff-side correction requests. Mirrors the whitelist in
 * the `_app_correction_editable_columns` SQL helper.
 *
 * `kind` controls how each field is rendered/serialized in the staff
 * ProposeChangesDrawer and how the value is serialized into JSON for the RPC.
 */
export type FieldKind =
  | 'text' | 'textarea' | 'date' | 'boolean'
  | 'select' | 'multiselect' | 'employers';

export interface CorrectionFieldDef {
  path: string;
  label: string;
  section: string;
  kind: FieldKind;
  options?: string[];
}

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const ENDORSEMENTS = ['H','N','P','S','T','X'];
const EQUIPMENT = ['Dry Van','Reefer','Flatbed','Tanker','Step Deck','Lowboy','Container','Auto Hauler','Other'];

export const CORRECTION_FIELDS: CorrectionFieldDef[] = [
  // Personal
  { path: 'first_name', label: 'First name', section: 'Personal', kind: 'text' },
  { path: 'last_name', label: 'Last name', section: 'Personal', kind: 'text' },
  { path: 'dob', label: 'Date of birth', section: 'Personal', kind: 'date' },
  { path: 'phone', label: 'Phone', section: 'Personal', kind: 'text' },
  { path: 'email', label: 'Email', section: 'Personal', kind: 'text' },
  // Address
  { path: 'address_street', label: 'Address — street', section: 'Address', kind: 'text' },
  { path: 'address_line2', label: 'Address — line 2', section: 'Address', kind: 'text' },
  { path: 'address_city', label: 'Address — city', section: 'Address', kind: 'text' },
  { path: 'address_state', label: 'Address — state', section: 'Address', kind: 'select', options: US_STATES },
  { path: 'address_zip', label: 'Address — ZIP', section: 'Address', kind: 'text' },
  { path: 'prev_address_street', label: 'Previous address — street', section: 'Address', kind: 'text' },
  { path: 'prev_address_city', label: 'Previous address — city', section: 'Address', kind: 'text' },
  { path: 'prev_address_state', label: 'Previous address — state', section: 'Address', kind: 'select', options: US_STATES },
  { path: 'prev_address_zip', label: 'Previous address — ZIP', section: 'Address', kind: 'text' },
  // CDL
  { path: 'cdl_state', label: 'CDL state', section: 'CDL', kind: 'select', options: US_STATES },
  { path: 'cdl_number', label: 'CDL number', section: 'CDL', kind: 'text' },
  { path: 'cdl_class', label: 'CDL class', section: 'CDL', kind: 'select', options: ['CDL-A','CDL-B','CDL-C'] },
  { path: 'cdl_expiration', label: 'CDL expiration', section: 'CDL', kind: 'date' },
  { path: 'endorsements', label: 'Endorsements', section: 'CDL', kind: 'multiselect', options: ENDORSEMENTS },
  { path: 'cdl_10_years', label: 'Held CDL for 10+ years', section: 'CDL', kind: 'boolean' },
  { path: 'referral_source', label: 'Referral source', section: 'CDL', kind: 'text' },
  // Employment
  { path: 'employers', label: 'Employment history', section: 'Employment', kind: 'employers' },
  { path: 'employment_gaps', label: 'Has employment gaps', section: 'Employment', kind: 'boolean' },
  { path: 'employment_gaps_explanation', label: 'Employment gaps explanation', section: 'Employment', kind: 'textarea' },
  // Driving
  { path: 'years_experience', label: 'Years of experience', section: 'Driving', kind: 'text' },
  { path: 'equipment_operated', label: 'Equipment operated', section: 'Driving', kind: 'multiselect', options: EQUIPMENT },
  // Accidents / Violations
  { path: 'dot_accidents', label: 'DOT accidents (past)', section: 'Accidents', kind: 'boolean' },
  { path: 'dot_accidents_description', label: 'DOT accidents — description', section: 'Accidents', kind: 'textarea' },
  { path: 'moving_violations', label: 'Moving violations (past)', section: 'Accidents', kind: 'boolean' },
  { path: 'moving_violations_description', label: 'Moving violations — description', section: 'Accidents', kind: 'textarea' },
  // Drug & Alcohol
  { path: 'sap_process', label: 'In SAP process', section: 'Drug & Alcohol', kind: 'boolean' },
  { path: 'dot_positive_test_past_2yr', label: 'DOT positive test (past 2 yr)', section: 'Drug & Alcohol', kind: 'boolean' },
  { path: 'dot_return_to_duty_docs', label: 'DOT return-to-duty docs available', section: 'Drug & Alcohol', kind: 'boolean' },
  // Medical / Documents
  { path: 'medical_cert_expiration', label: 'Medical certificate expiration', section: 'Documents', kind: 'date' },
];

export function getFieldDef(path: string): CorrectionFieldDef | undefined {
  return CORRECTION_FIELDS.find((f) => f.path === path);
}

/**
 * Format a JSON value for read-only display in the diff viewer / email.
 */
export function formatValue(v: unknown, kind?: FieldKind): string {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (kind === 'boolean' || typeof v === 'boolean') {
    // Boolean-kind fields may arrive as native booleans (from Postgres) OR
    // as 'yes'/'no'/'true'/'false' strings (from the form/RadioGroup). Coerce
    // to a real boolean before rendering so 'no' does not render as "Yes".
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = String(v).trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
    if (s === 'no' || s === 'false' || s === '0') return 'No';
    return '(empty)';
  }
  if (Array.isArray(v)) {
    if (!v.length) return '(empty)';
    if (kind === 'employers' || v.some((x) => x && typeof x === 'object')) {
      return v.map((x) => formatEmployer(x)).join(' • ');
    }
    return v.join(', ');
  }
  if (typeof v === 'object') {
    if (kind === 'employers') return formatEmployer(v);
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/** Format a single employer record as a one-line readable string. */
export function formatEmployer(e: unknown): string {
  if (!e || typeof e !== 'object') return '(empty)';
  const r = e as Record<string, unknown>;
  const name = (r.name as string) || 'Unnamed employer';
  const city = (r.city as string) || '';
  const state = (r.state as string) || '';
  const loc = [city, state].filter(Boolean).join(', ');
  const start = (r.start_date as string) || '';
  const end = (r.end_date as string) || 'Present';
  const dates = start ? `${start} → ${end}` : '';
  let out = name;
  if (loc) out += ` (${loc})`;
  if (dates) out += ` — ${dates}`;
  return out;
}