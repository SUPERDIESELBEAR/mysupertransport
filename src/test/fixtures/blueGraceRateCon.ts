/**
 * Golden text from the Blue Grace tender BG969676425 (original and revised).
 *
 * Extracted from the PDFs with `pdftotext -layout`, not retyped. The double
 * asterisks the broker printed around `**CAN GET NEED TIH.**` and
 * `**ELECTRONIC TRACKING IS REQUIRED**` are part of the page and are part of
 * the fixture: a transcription that tidies them away is not verbatim.
 *
 * Two artefacts of this document's text layer are preserved deliberately:
 *   - `¶` after REQUIRED — the layer's rendering of `53' 102"`
 *   - `OS&amp;amp;amp;amp;amp;amp;amp;amp;D` — the layer's rendering of `OS&D`
 * They are why verification normalizes layer damage instead of demanding exact
 * containment, and a test that removed them would stop proving that.
 */

/** The Special Instructions block, exactly as the text layer yields it. */
export const BG_SPECIAL_INSTRUCTIONS_LAYER = [
  'REQUIRED ¶  SWING DOOR REEFER TRAILER(MUST BE DOWNLOADABLE), CLEAN, ODOR FREE WITH PERFECT',
  'CHUTE CONDITION. CENTER CHUTES ONLY. SIDE CHUTES WILL NOT BE LOADED. PRECOOL TRAILER PRIOR TO CHECKIN',
  'IN AT SHIPPER. ALL ORDER#S MUST BE USED TO **CAN GET NEED TIH.**CHECK IN AT SHIPPER. WASHOUT IS',
  'MANDATORY ON SITE AT SHIPPER. DRIVER MUST PAY $30 ON SITE**ELECTRONIC TRACKING IS REQUIRED**ANY PU/DEL',
  'DELAYS OR OS&amp;amp;amp;amp;amp;amp;amp;amp;D MUST BE REPORTED IN REAL TIME. CALL (800) 697-4477 AND/ OR',
  'EMAIL CALAVO@BLUEGRACEGROUP.COM FOR ASSISTANCE.*ALL ACCESSORIALS MUST BE SUBMITTED/REQUESTED',
  'WITH DOCS WITHIN 24HRS OF DELIV OR NO REIMBURSMENT*NO DETENTION ON PRODUCE.**',
].join('\n');

/**
 * What a faithful transcription of that block looks like: the same words, order,
 * punctuation, casing and asterisks, with the layer's own damage resolved back
 * to what the page shows a human reader.
 */
export const BG_SPECIAL_INSTRUCTIONS_VERBATIM = [
  'REQUIRED 53\' 102" SWING DOOR REEFER TRAILER(MUST BE DOWNLOADABLE), CLEAN, ODOR FREE WITH PERFECT',
  'CHUTE CONDITION. CENTER CHUTES ONLY. SIDE CHUTES WILL NOT BE LOADED. PRECOOL TRAILER PRIOR TO CHECKIN',
  'IN AT SHIPPER. ALL ORDER#S MUST BE USED TO **CAN GET NEED TIH.**CHECK IN AT SHIPPER. WASHOUT IS',
  'MANDATORY ON SITE AT SHIPPER. DRIVER MUST PAY $30 ON SITE**ELECTRONIC TRACKING IS REQUIRED**ANY PU/DEL',
  'DELAYS OR OS&D MUST BE REPORTED IN REAL TIME. CALL (800) 697-4477 AND/ OR',
  'EMAIL CALAVO@BLUEGRACEGROUP.COM FOR ASSISTANCE.*ALL ACCESSORIALS MUST BE SUBMITTED/REQUESTED',
  'WITH DOCS WITHIN 24HRS OF DELIV OR NO REIMBURSMENT*NO DETENTION ON PRODUCE.**',
].join('\n');

/**
 * The condensed rewrite the parser used to store. Kept as a fixture because it
 * is the failure the verifier has to catch: it reads plausibly, and it dropped
 * the assistance phone number and the email address that are printed on the page.
 */
export const BG_SPECIAL_INSTRUCTIONS_PARAPHRASE = [
  'Requires a 53\' swing door reefer trailer, downloadable, clean and odor free with center chutes only.',
  'Precool trailer before check-in. Washout is mandatory on site; driver pays $30.',
  'Electronic tracking is required. Report any pickup or delivery delays in real time.',
  'All accessorials must be submitted with documents within 24 hours of delivery. No detention on produce.',
].join('\n');

/**
 * The BGLF terms paragraph, printed above the Comments block on page 1 — the
 * whole block, not its closing lines. The field is the paragraph, so a fixture
 * holding only its tail was never covering the field it claimed to cover.
 */
export const BG_BROKER_TERMS_LAYER = [
  'BlueGrace Logistics (BGLF) will only consider additional charges if agreed to in writing. Carrier must inform BGLF at the',
  'time charges occur and of all unplanned accessorial or other additional charges incurred. BGLF will not reimburse',
  'detention charges unless reported at the time of the event, and "in" and "out" times are clearly stated on the Bill of',
  'Lading. BGLF will reimburse Carrier for approved lumper costs upon submission of a signed receipt. OS&D must be',
  'reported prior to leaving the consignee. PLEASE NOTE: Invoices and PODs must be submitted within 24 hours of',
  'delivery for Payment to: TLInvoices@bluegracegroup.com. Payment will not be processed without all required',
  'paperwork. Reference is made to the broker-carrier agreement between BGLF and Carrier for the legal requirements and',
  'terms between the parties.',
].join('\n');

/** Stop 1's comment line. Note the label prints as `PU#` here. */
export const BG_STOP1_COMMENT = 'Comments: PU# IX00286060';

/** The References table on the ORIGINAL tender, in printed order. */
export const BG_REFERENCES_ORIGINAL = [
  { label: 'BOL', value: 'BG969676425' },
  { label: 'Mode', value: 'TL' },
  { label: 'Pickup Number', value: '562117' },
  { label: 'Pickup Number', value: 'IX00286060' },
  { label: 'PO Number', value: '001000562117' },
];

/**
 * The REVISED tender adds a PRO row whose value equals the BOL. Deduping on
 * value alone would swallow it; this is the row that went missing from the diff.
 */
export const BG_REFERENCES_REVISED = [
  ...BG_REFERENCES_ORIGINAL,
  { label: 'PRO', value: 'BG969676425' },
];
