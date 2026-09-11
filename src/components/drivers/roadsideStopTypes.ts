export type RoadsideStopType = 'dot_inspection' | 'traffic_stop';
export type RoadsideStopReason =
  | 'random'
  | 'weigh_station'
  | 'moving_violation'
  | 'equipment'
  | 'logs_hos'
  | 'permit_credential'
  | 'other';
export type RoadsideStopOutcome =
  | 'clean'
  | 'warning'
  | 'citation'
  | 'violations_no_oos'
  | 'out_of_service';
export type RoadsideInspectionLevel =
  | 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_5' | 'level_6';

export const STOP_TYPES: { value: RoadsideStopType; label: string }[] = [
  { value: 'dot_inspection', label: 'DOT Inspection' },
  { value: 'traffic_stop', label: 'Traffic Stop' },
];

export const STOP_REASONS: { value: RoadsideStopReason; label: string }[] = [
  { value: 'random', label: 'Random / routine' },
  { value: 'weigh_station', label: 'Weigh station' },
  { value: 'moving_violation', label: 'Moving violation' },
  { value: 'equipment', label: 'Equipment issue' },
  { value: 'logs_hos', label: 'Logs / hours of service' },
  { value: 'permit_credential', label: 'Permit or credential' },
  { value: 'other', label: 'Other' },
];

export const STOP_OUTCOMES: { value: RoadsideStopOutcome; label: string }[] = [
  { value: 'clean', label: 'Clean — no violations' },
  { value: 'warning', label: 'Warning issued' },
  { value: 'citation', label: 'Citation issued' },
  { value: 'violations_no_oos', label: 'Violations noted' },
  { value: 'out_of_service', label: 'Out of service' },
];

export const INSPECTION_LEVELS: { value: RoadsideInspectionLevel; label: string }[] = [
  { value: 'level_1', label: 'Level I — Full' },
  { value: 'level_2', label: 'Level II — Walk-around' },
  { value: 'level_3', label: 'Level III — Driver only' },
  { value: 'level_4', label: 'Level IV — Special' },
  { value: 'level_5', label: 'Level V — Vehicle only' },
  { value: 'level_6', label: 'Level VI — Radioactive' },
];

/**
 * Plain descriptions of the three levels that carry a clean-inspection bonus.
 * One source of wording for staff and drivers alike.
 */
export interface InspectionLevelInfo {
  value: RoadsideInspectionLevel;
  title: string;
  summary: string;
  covers: string;
  process: string;
  special: string;
}

export const INSPECTION_LEVEL_INFO: InspectionLevelInfo[] = [
  {
    value: 'level_1',
    title: 'Level I — North American Standard Inspection',
    summary: 'The most detailed and most common roadside check.',
    covers: 'Both the driver and the entire vehicle.',
    process: 'A 37-step procedure. The officer checks the driver license, medical card and hours-of-service logs, then inspects lights, tires, brakes and cargo securement.',
    special: 'The officer goes underneath the vehicle to check the frame, suspension and brake components. Passing without critical defects can earn a CVSA decal.',
  },
  {
    value: 'level_2',
    title: 'Level II — Walk-Around Driver/Vehicle Inspection',
    summary: 'Faster than Level I because it stays on the outside of the truck.',
    covers: 'Driver credentials and visible vehicle parts.',
    process: 'The officer reviews the paperwork and does a full walk-around, looking at tires, lights, fluid leaks and visible safety equipment.',
    special: 'The officer does not go underneath the vehicle or measure undercarriage brake components.',
  },
  {
    value: 'level_3',
    title: 'Level III — Driver/Credential/Administrative Inspection',
    summary: 'A focused review of the person behind the wheel.',
    covers: 'The driver only.',
    process: 'The officer checks the driver license, medical examiner\u2019s certificate, hazardous materials endorsement if applicable, and electronic logs or records of duty status.',
    special: 'No physical inspection of the truck takes place during a Level III review.',
  },
];

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

export const labelFor = <T extends string>(list: { value: T; label: string }[], v: T | null | undefined) =>
  list.find(i => i.value === v)?.label ?? '—';

export interface RoadsideStopViolation {
  id?: string;
  stop_id?: string;
  code: string | null;
  description: string | null;
  unit: string;
  is_oos: boolean;
}

export interface RoadsideStopDocument {
  id: string;
  stop_id: string;
  file_path: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

export interface RoadsideStop {
  id: string;
  operator_id: string;
  driver_id: string | null;
  load_id: string | null;
  truck_unit_number: string | null;
  stop_at: string;
  state: string | null;
  location: string | null;
  stop_type: RoadsideStopType;
  stop_reason: RoadsideStopReason;
  outcome: RoadsideStopOutcome;
  inspection_report_number: string | null;
  inspection_level: RoadsideInspectionLevel | null;
  inspector_name: string | null;
  agency: string | null;
  cvsa_sticker: boolean;
  oos_driver: boolean;
  oos_vehicle: boolean;
  citation_issued: boolean;
  fine_amount: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  roadside_stop_violations?: RoadsideStopViolation[];
  roadside_stop_documents?: RoadsideStopDocument[];
}
