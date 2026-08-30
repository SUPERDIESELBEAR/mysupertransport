/**
 * The applicant-facing wording of the driver application, in one place.
 *
 * WHY THIS FILE EXISTS: the printed/downloaded application must reproduce the
 * sentence the applicant actually read, not an internal label like
 * "Safety history: Yes". If the wording lived only inside the Step components
 * the printed copy would drift away from the form the moment anyone edited a
 * question — and the drift would be invisible until a DOT audit.
 *
 * Both the on-screen form steps and the PDF renderer read these strings.
 * Treat every value here as legal text: relocating it is fine, rewording it is
 * a policy decision.
 */

export const APPLICATION_TITLE = 'Driver Application for Employment';

export const SECTION_TITLES = {
  personal: 'Personal Information',
  cdl: 'Commercial Driver License',
  employment: 'Employment History',
  driving: 'Driving Experience',
  accidents: 'Accidents & Traffic Violations',
  drugAlcohol: 'DOT Drug & Alcohol Pre-Employment Questions',
  documents: 'Submitted Documents',
  disclosures: 'Disclosures & Authorizations',
  signature: 'Applicant Certification & Signature',
} as const;

/* ── Employment history ───────────────────────────────────────────────── */

export const EMPLOYMENT_INTRO =
  'Federal regulations (49 CFR § 391.21) require a complete record of all employment '
  + 'during the preceding three (3) years, and — because this position involves operating a '
  + 'commercial motor vehicle — all employment involving the operation of a commercial motor '
  + 'vehicle during the preceding ten (10) years. List employers in order, most recent first.';

export const EMPLOYMENT_GAPS_QUESTION =
  'Are there any gaps of thirty (30) days or more in the employment history listed above?';

export const EMPLOYMENT_GAPS_EXPLANATION_LABEL =
  'Explanation of any gap in employment of thirty (30) days or more';

export const CDL_10_YEARS_QUESTION =
  'Have you held a Commercial Driver License (CDL) for ten (10) years or more?';

/* ── Driving experience ───────────────────────────────────────────────── */

export const DRIVING_EXPERIENCE_INTRO =
  'State the number of years you have operated a commercial motor vehicle and the types '
  + 'of equipment you have operated.';

/* ── Accidents & violations ───────────────────────────────────────────── */

export const ACCIDENTS_INTRO =
  'You must list all motor vehicle accidents you were involved in during the preceding '
  + 'three (3) years, and all traffic convictions and forfeitures of bond or collateral '
  + 'during the preceding three (3) years (49 CFR § 391.21).';

export const ACCIDENTS_QUESTION =
  'Have you been involved in any DOT-recordable accident during the preceding three (3) years?';

export const VIOLATIONS_QUESTION =
  'Have you been convicted of, or forfeited bond or collateral for, any moving traffic '
  + 'violation during the preceding three (3) years?';

/* ── FCRA ─────────────────────────────────────────────────────────────── */

export const FCRA_HEADING = 'Fair Credit Reporting Act Authorization';

export const FCRA_DISCLOSURE =
  'I hereby authorize SUPERTRANSPORT to conduct a background investigation through a '
  + 'consumer reporting agency as permitted by the Fair Credit Reporting Act. This '
  + 'investigation may include, but is not limited to: Social Security Number verification, '
  + 'residential history, employment history, education verification, personal and '
  + 'professional references, credit history, criminal records, motor vehicle records (MVR), '
  + 'and any other public records deemed relevant. I understand that this investigation is a '
  + 'condition of my application and continued employment, and that I have the right to '
  + 'request disclosure of the nature and scope of any investigation.';

/* ── PSP ──────────────────────────────────────────────────────────────── */

export const PSP_HEADING = 'PSP Authorization';

export const PSP_DISCLOSURE_TITLE =
  'Important Disclosure Regarding Background Reports from the PSP Online Service';

export const PSP_DISCLOSURE_PARAGRAPHS = [
  'In connection with your application for employment with SUPERTRANSPORT, LLC, we may '
  + 'obtain one or more reports regarding your driving and safety inspection history from the '
  + 'Federal Motor Carrier Safety Administration (FMCSA). If any adverse employment decision '
  + 'is made based on this information, you will be notified and provided a copy of the report.',
  'Neither the Prospective Employer nor the FMCSA contractor has the capability to correct '
  + 'safety data. You may challenge the accuracy of the data at https://dataqs.fmcsa.dot.gov.',
];

export const AUTH_SAFETY_HISTORY =
  'I authorize SUPERTRANSPORT, LLC to access the FMCSA Pre-Employment Screening Program '
  + '(PSP) system to seek information regarding my commercial driving safety record and safety '
  + 'inspection history, including crash data from the previous five (5) years and inspection '
  + 'history from the previous three (3) years.';

export const AUTH_DRUG_ALCOHOL =
  'I consent to the release of information regarding my DOT drug and alcohol testing history '
  + 'from previous employers, including the FMCSA Drug & Alcohol Clearinghouse.';

export const AUTH_PREVIOUS_EMPLOYERS =
  'I have read the above Disclosure Regarding Background Reports and I hereby authorize '
  + 'Prospective Employer and its employees, authorized agents, and/or affiliates to obtain the '
  + 'information authorized above.';

/* ── DOT drug & alcohol pre-employment questions ──────────────────────── */

export const DOT_40_25_J_NOTICE =
  '49 CFR Part 40.25(j) Notice: As required by federal regulations, you must answer the '
  + 'following questions truthfully. This information will be used to assess your eligibility '
  + 'to perform safety-sensitive transportation functions.';

export const DOT_POSITIVE_TEST_QUESTION =
  'Have you tested positive, or refused to test, on any pre-employment drug or alcohol test '
  + 'administered by an employer to which you applied for, but did not obtain, safety-sensitive '
  + 'transportation work covered by DOT agency drug and alcohol testing rules during the past '
  + 'two years?';

export const DOT_RETURN_TO_DUTY_QUESTION =
  'Can you provide documentation of successful completion of DOT return-to-duty requirements '
  + '(including follow-up tests)?';

export const SAP_PROCESS_QUESTION =
  'Are you currently enrolled in, or have you not yet completed, the Substance Abuse '
  + 'Professional (SAP) return-to-duty process?';

/* ── Company testing policy ───────────────────────────────────────────── */

export const TESTING_POLICY_HEADING = 'Certificate of Receipt — Company Testing Policy';

export const TESTING_POLICY_TITLE =
  'SUPERTRANSPORT — Federal Motor Carrier Safety Compliance Notice';

export const TESTING_POLICY_PARAGRAPHS = [
  "By accepting these terms, you acknowledge that you have received, read, and understand "
  + "SUPERTRANSPORT's Drug and Alcohol Policy as required by 49 CFR §382.601. You certify that "
  + 'you are familiar with the requirements of 49 CFR Parts 40, 382, and 391, and you agree to '
  + "comply with all applicable FMCSA regulations while operating under SUPERTRANSPORT's authority.",
  'You acknowledge that: (1) you are subject to controlled substance and alcohol testing as a '
  + 'condition of employment; (2) a positive test result or refusal to test will result in '
  + 'immediate removal from safety-sensitive duties; (3) you understand the consequences of '
  + 'violations and your rights as described in the policy.',
  'You certify that all information provided in this application is accurate and complete to '
  + 'the best of your knowledge, and that providing false information may result in '
  + 'disqualification from consideration or termination of employment.',
];

export const TESTING_POLICY_ACCEPTANCE =
  'I accept the Terms and Conditions, acknowledge receipt of the Company Drug & Alcohol '
  + 'Testing Policy, and certify that all information in this application is true and complete.';

/* ── Signature ────────────────────────────────────────────────────────── */

export const SIGNATURE_CERTIFICATION =
  'I certify that all information provided in this application is true and complete to the '
  + 'best of my knowledge, and I understand that any false statement or omission may disqualify '
  + 'me from consideration for employment or result in termination of employment.';

/** Printed when a value the applicant could have supplied was left empty. */
export const NOT_PROVIDED = 'Not provided';
