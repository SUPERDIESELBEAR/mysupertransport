export interface EmployerRecord {
  name: string;
  city: string;
  state: string;
  position: string;
  reason_leaving: string;
  cmv_position: string; // 'yes' | 'no'
  start_date: string;
  end_date: string;
  email?: string;
}

export interface ApplicationFormData {
  // Personal
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  address_street: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_duration: string; // 'less_than_3' | '3_or_more'
  prev_address_street: string;
  prev_address_line2: string;
  prev_address_city: string;
  prev_address_state: string;
  prev_address_zip: string;

  // CDL
  cdl_state: string;
  cdl_number: string;
  cdl_class: string; // 'CDL-A' | 'CDL-B' | 'CDL-C'
  cdl_expiration: string;
  endorsements: string[];
  cdl_10_years: string; // 'yes' | 'no'
  referral_source: string;

  // Employment
  employers: EmployerRecord[];
  employment_gaps: string; // 'yes' | 'no'
  employment_gaps_explanation: string;

  // Driving
  years_experience: string;
  equipment_operated: string[];

  // Accident/Violation
  dot_accidents: string; // 'yes' | 'no'
  dot_accidents_description: string;
  moving_violations: string; // 'yes' | 'no'
  moving_violations_description: string;

  // DOT Drug/Alcohol
  sap_process: string; // 'yes' | 'no'

  // Documents (URLs after upload)
  dl_front_url: string;
  dl_rear_url: string;
  medical_cert_url: string;

  // Disclosures
  auth_safety_history: boolean;
  auth_drug_alcohol: boolean;
  auth_previous_employers: boolean;
  dot_positive_test_past_2yr: string; // 'yes' | 'no'
  dot_return_to_duty_docs: string; // 'yes' | 'no'
  testing_policy_accepted: boolean;

  // Signature
  ssn: string;
  typed_full_name: string;
  signature_image_url: string;
  signed_date: string;
}

export const defaultEmployer: EmployerRecord = {
  name: '',
  city: '',
  state: '',
  position: '',
  reason_leaving: '',
  cmv_position: '',
  start_date: '',
  end_date: '',
  email: '',
};

export const defaultFormData: ApplicationFormData = {
  first_name: '', last_name: '', dob: '', phone: '', email: '',
  address_street: '', address_line2: '', address_city: '', address_state: '', address_zip: '',
  address_duration: '', prev_address_street: '', prev_address_line2: '',
  prev_address_city: '', prev_address_state: '', prev_address_zip: '',
  cdl_state: '', cdl_number: '', cdl_class: '', cdl_expiration: '',
  endorsements: [], cdl_10_years: '', referral_source: '',
  employers: [{ ...defaultEmployer }],
  employment_gaps: '', employment_gaps_explanation: '',
  years_experience: '', equipment_operated: [],
  dot_accidents: '', dot_accidents_description: '',
  moving_violations: '', moving_violations_description: '',
  sap_process: '',
  dl_front_url: '', dl_rear_url: '', medical_cert_url: '',
  auth_safety_history: false, auth_drug_alcohol: false, auth_previous_employers: false,
  dot_positive_test_past_2yr: '', dot_return_to_duty_docs: '',
  testing_policy_accepted: false,
  ssn: '', typed_full_name: '', signature_image_url: '',
  signed_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
};

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];
