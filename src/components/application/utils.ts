import { ApplicationFormData } from './types';

// ─── Title-case normalizer ─────────────────────────────────────────────────
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => 'Mc' + c.toUpperCase());
}

// ─── Validation ────────────────────────────────────────────────────────────
export function validateStep(step: number, data: ApplicationFormData): Partial<Record<keyof ApplicationFormData, string>> {
  const errs: Partial<Record<keyof ApplicationFormData, string>> = {};

  if (step === 1) {
    if (!data.first_name.trim()) errs.first_name = 'First name is required';
    if (!data.last_name.trim()) errs.last_name = 'Last name is required';
    if (!data.dob) errs.dob = 'Date of birth is required';
    if (!data.phone.trim()) errs.phone = 'Phone number is required';
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Valid email is required';
    if (!data.address_street.trim()) errs.address_street = 'Street address is required';
    if (!data.address_city.trim()) errs.address_city = 'City is required';
    if (!data.address_state) errs.address_state = 'State is required';
    if (!data.address_zip.trim()) errs.address_zip = 'ZIP code is required';
    if (!data.address_duration) errs.address_duration = 'Please select how long you have lived here';
  }

  if (step === 2) {
    if (!data.cdl_state) errs.cdl_state = 'CDL state is required';
    if (!data.cdl_number.trim()) errs.cdl_number = 'CDL number is required';
    if (!data.cdl_class) errs.cdl_class = 'CDL class is required';
    if (!data.cdl_expiration) errs.cdl_expiration = 'CDL expiration date is required';
    if (!data.endorsements.length) errs.endorsements = 'Please select at least one option (select "None" if no endorsements)' as any;
    if (!data.cdl_10_years) errs.cdl_10_years = 'Please answer this question';
    if (!data.referral_source) errs.referral_source = 'Please tell us how you heard about us';
  }

  if (step === 3) {
    const emp0 = data.employers[0];
    if (!emp0 || !emp0.name.trim()) errs.employers = 'Current/last employer name is required' as any;
    else if (!emp0.city.trim()) errs.employers = 'City is required for the current employer' as any;
    else if (!emp0.state.trim()) errs.employers = 'State is required for the current employer' as any;
    else if (!emp0.position.trim()) errs.employers = 'Position held is required for the current employer' as any;
    else if (!emp0.reason_leaving.trim() && emp0.end_date !== 'Present') errs.employers = 'Reason for leaving is required for the current employer' as any;
    // Check all employers have position and reason_leaving
    for (let i = 1; i < data.employers.length; i++) {
      const emp = data.employers[i];
      if (emp.name.trim() && !emp.city.trim()) {
        errs.employers = `City is required for employer ${i + 1}` as any;
        break;
      }
      if (emp.name.trim() && !emp.state.trim()) {
        errs.employers = `State is required for employer ${i + 1}` as any;
        break;
      }
      if (emp.name.trim() && !emp.position.trim()) {
        errs.employers = `Position held is required for employer ${i + 1}` as any;
        break;
      }
      if (emp.name.trim() && !emp.reason_leaving.trim() && emp.end_date !== 'Present') {
        errs.employers = `Reason for leaving is required for employer ${i + 1}` as any;
        break;
      }
    }
    if (!data.employment_gaps) errs.employment_gaps = 'Please answer this question';
  }

  if (step === 4) {
    if (!data.years_experience) errs.years_experience = 'Please select your years of experience';
    if (!data.equipment_operated.length) errs.equipment_operated = 'Please select at least one equipment type' as any;
  }

  if (step === 5) {
    if (!data.dot_accidents) errs.dot_accidents = 'Please answer this question';
    if (data.dot_accidents === 'yes' && !data.dot_accidents_description?.trim())
      errs.dot_accidents_description = 'Please describe each accident';
    if (!data.moving_violations) errs.moving_violations = 'Please answer this question';
    if (data.moving_violations === 'yes' && !data.moving_violations_description?.trim())
      errs.moving_violations_description = 'Please describe each violation';
  }

  if (step === 6) {
    if (!data.sap_process) errs.sap_process = 'Please answer this question';
  }

  if (step === 7) {
    if (!data.dl_front_url) errs.dl_front_url = 'Front of driver\'s license is required';
    if (!data.dl_rear_url) errs.dl_rear_url = 'Rear of driver\'s license is required';
    if (!data.medical_cert_url) errs.medical_cert_url = 'Medical certificate is required';
  }

  if (step === 8) {
    if (!data.auth_safety_history) errs.auth_safety_history = 'You must authorize this to proceed';
    if (!data.auth_drug_alcohol) errs.auth_drug_alcohol = 'You must authorize this to proceed';
    if (!data.auth_previous_employers) errs.auth_previous_employers = 'You must authorize this to proceed';
    if (!data.dot_positive_test_past_2yr) errs.dot_positive_test_past_2yr = 'Please answer this question';
    if (!data.testing_policy_accepted) errs.testing_policy_accepted = 'You must accept the terms to proceed';
  }

  if (step === 9) {
    if (!data.ssn.trim() || data.ssn.replace(/\D/g, '').length < 9) errs.ssn = 'Valid SSN is required (9 digits)';
    if (!data.typed_full_name.trim()) errs.typed_full_name = 'Please type your full legal name';
    if (!data.signature_image_url) errs.signature_image_url = 'Please draw your signature';
  }

  return errs;
}

// ─── Payload builder ──────────────────────────────────────────────────────
export function buildPayload(data: ApplicationFormData, token: string, isDraft: boolean, ssnEncrypted?: string | null): Record<string, unknown> {
  return {
    draft_token: token,
    is_draft: isDraft,
    email: data.email,
    first_name: toTitleCase(data.first_name) || null,
    last_name: toTitleCase(data.last_name) || null,
    dob: data.dob || null,
    phone: data.phone || null,
    address_street: toTitleCase(data.address_street) || null,
    address_line2: toTitleCase(data.address_line2) || null,
    address_city: toTitleCase(data.address_city) || null,
    address_state: data.address_state || null,
    address_zip: data.address_zip || null,
    address_duration: data.address_duration || null,
    prev_address_street: toTitleCase(data.prev_address_street) || null,
    prev_address_line2: toTitleCase(data.prev_address_line2) || null,
    prev_address_city: toTitleCase(data.prev_address_city) || null,
    prev_address_state: data.prev_address_state || null,
    prev_address_zip: data.prev_address_zip || null,
    cdl_state: data.cdl_state || null,
    cdl_number: data.cdl_number || null,
    cdl_class: data.cdl_class || null,
    cdl_expiration: data.cdl_expiration || null,
    endorsements: data.endorsements.length ? data.endorsements : null,
    cdl_10_years: data.cdl_10_years === 'yes' ? true : data.cdl_10_years === 'no' ? false : null,
    referral_source: data.referral_source || null,
    employers: data.employers.filter(e => e.name.trim()).map(e => ({
      ...e,
      name: toTitleCase(e.name),
      city: toTitleCase(e.city),
    })) as unknown as Record<string, unknown>[],
    employment_gaps: data.employment_gaps === 'yes' ? true : data.employment_gaps === 'no' ? false : null,
    employment_gaps_explanation: data.employment_gaps_explanation || null,
    years_experience: data.years_experience || null,
    equipment_operated: data.equipment_operated.length ? data.equipment_operated : null,
    dot_accidents: data.dot_accidents === 'yes' ? true : data.dot_accidents === 'no' ? false : null,
    dot_accidents_description: data.dot_accidents_description || null,
    moving_violations: data.moving_violations === 'yes' ? true : data.moving_violations === 'no' ? false : null,
    moving_violations_description: data.moving_violations_description || null,
    sap_process: data.sap_process === 'yes' ? true : data.sap_process === 'no' ? false : null,
    dl_front_url: data.dl_front_url || null,
    dl_rear_url: data.dl_rear_url || null,
    medical_cert_url: data.medical_cert_url || null,
    auth_safety_history: data.auth_safety_history,
    auth_drug_alcohol: data.auth_drug_alcohol,
    auth_previous_employers: data.auth_previous_employers,
    dot_positive_test_past_2yr: data.dot_positive_test_past_2yr === 'yes' ? true : data.dot_positive_test_past_2yr === 'no' ? false : null,
    dot_return_to_duty_docs: data.dot_return_to_duty_docs === 'yes' ? true : data.dot_return_to_duty_docs === 'no' ? false : null,
    testing_policy_accepted: data.testing_policy_accepted,
    ssn_encrypted: ssnEncrypted ?? null,
    typed_full_name: data.typed_full_name || null,
    signature_image_url: data.signature_image_url || null,
    signed_date: data.signed_date || null,
  };
}
