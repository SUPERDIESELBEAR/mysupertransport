import * as pdfLib from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import { ELD_NOTICE_BUCKET } from '@/lib/eld/pendingNotice';
import { MALFUNCTION_CODE_LABEL } from '@/lib/eld/constants';
import {
  buildExtensionRequest,
  type ExtensionRequestData,
} from '../../../supabase/functions/_shared/extensionRequestCore';

export type ExtensionRequestStatus =
  | 'draft' | 'submitted' | 'granted' | 'denied' | 'withdrawn';

export type ExtensionRequestRow = {
  id: string;
  event_id: string;
  operator_id: string;
  is_demo: boolean;
  status: ExtensionRequestStatus;
  filer_name: string;
  filer_title: string;
  filer_phone: string;
  filer_email: string;
  carrier_legal_name: string;
  carrier_usdot: string;
  carrier_mc: string | null;
  carrier_main_office_address: string;
  fmcsa_division_state: string;
  device_provider: string | null;
  device_make: string | null;
  device_model: string | null;
  device_serial: string | null;
  eld_registration_id: string | null;
  driver_name: string;
  driver_license_number: string | null;
  driver_license_state: string | null;
  vehicle_unit_number: string | null;
  vehicle_vin: string | null;
  malfunction_code: string;
  malfunction_description: string;
  discovered_at: string;
  reported_at: string;
  discovered_location: string;
  repair_deadline: string;
  actions_taken: string;
  why_extension_needed: string;
  requested_through: string;
  pdf_path: string | null;
  generated_at: string | null;
  submitted_at: string | null;
  response_status_at: string | null;
  response_date: string | null;
  response_reference: string | null;
  response_notes: string | null;
  granted_through: string | null;
  created_at: string;
  updated_at: string;
};

export const EXTENSION_REQUEST_SELECT = `id, event_id, operator_id, is_demo, status,
  filer_name, filer_title, filer_phone, filer_email,
  carrier_legal_name, carrier_usdot, carrier_mc, carrier_main_office_address, fmcsa_division_state,
  device_provider, device_make, device_model, device_serial, eld_registration_id,
  driver_name, driver_license_number, driver_license_state, vehicle_unit_number, vehicle_vin,
  malfunction_code, malfunction_description, discovered_at, reported_at, discovered_location,
  repair_deadline, actions_taken, why_extension_needed, requested_through,
  pdf_path, generated_at, submitted_at, response_status_at, response_date, response_reference,
  response_notes, granted_through, created_at, updated_at`;

export const EXTENSION_STATUS_LABEL: Record<ExtensionRequestStatus, string> = {
  draft: 'Draft — not filed',
  submitted: 'Filed with FMCSA',
  granted: 'Granted',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
};

/**
 * Carrier identity the filing must carry. A missing field is a setup gap, not
 * an exception: the console names the field and where to set it, and the
 * generate button stays disabled until it is filled in.
 */
export type CarrierProfileRow = {
  legal_name: string | null;
  usdot_number: string | null;
  mc_number: string | null;
  main_office_address: string | null;
  fmcsa_division_state: string | null;
};

const REQUIRED_CARRIER_FIELDS: Array<[keyof CarrierProfileRow, string]> = [
  ['legal_name', 'Carrier legal name'],
  ['usdot_number', 'USDOT number'],
  ['main_office_address', 'Principal place of business address'],
  ['fmcsa_division_state', 'FMCSA Division state'],
];

export function missingCarrierFields(profile: CarrierProfileRow | null): string[] {
  if (!profile) return REQUIRED_CARRIER_FIELDS.map(([, label]) => label);
  return REQUIRED_CARRIER_FIELDS
    .filter(([key]) => !String(profile[key] ?? '').trim())
    .map(([, label]) => label);
}

export function carrierSetupMessage(missing: string[]): string {
  return `This filing cannot be generated yet: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set on the carrier profile. Set ${missing.length === 1 ? 'it' : 'them'} under Settings → Carrier profile, then reopen this request.`;
}

function dateDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function stampDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString('en-US', { timeZone: 'America/Chicago' });
}

/**
 * Builds the PDF payload from the FROZEN request row alone. Nothing here reads
 * carrier_profile or eld_devices — a re-render must reproduce the filing.
 */
export function extensionRequestPdfData(row: ExtensionRequestRow): ExtensionRequestData {
  return {
    filerName: row.filer_name,
    filerTitle: row.filer_title,
    filerPhone: row.filer_phone,
    filerEmail: row.filer_email,
    carrierLegalName: row.carrier_legal_name,
    carrierUsdot: row.carrier_usdot,
    carrierMc: row.carrier_mc,
    carrierMainOfficeAddress: row.carrier_main_office_address,
    fmcsaDivisionState: row.fmcsa_division_state,
    driverName: row.driver_name,
    driverLicenseNumber: row.driver_license_number,
    driverLicenseState: row.driver_license_state,
    vehicleUnitNumber: row.vehicle_unit_number,
    vehicleVin: row.vehicle_vin,
    deviceProvider: row.device_provider,
    deviceMake: row.device_make,
    deviceModel: row.device_model,
    deviceSerial: row.device_serial,
    eldRegistrationId: row.eld_registration_id,
    malfunctionCode: row.malfunction_code,
    malfunctionCodeLabel: MALFUNCTION_CODE_LABEL[row.malfunction_code] ?? 'Malfunction',
    malfunctionDescription: row.malfunction_description,
    discoveredAtDisplay: stampDisplay(row.discovered_at) ?? '',
    discoveredLocation: row.discovered_location,
    reportedAtDisplay: stampDisplay(row.reported_at) ?? '',
    repairDeadlineDisplay: dateDisplay(row.repair_deadline) ?? '',
    actionsTaken: row.actions_taken,
    whyExtensionNeeded: row.why_extension_needed,
    requestedThroughDisplay: dateDisplay(row.requested_through) ?? '',
    filedOnDisplay: stampDisplay(row.submitted_at),
    responseStatus: row.status === 'granted' || row.status === 'denied' ? row.status : null,
    responseDateDisplay: dateDisplay(row.response_date),
    responseReference: row.response_reference,
    responseNotes: row.response_notes,
    grantedThroughDisplay: dateDisplay(row.granted_through),
    isDemo: row.is_demo === true,
  };
}

export async function renderExtensionRequestBlob(row: ExtensionRequestRow): Promise<Blob> {
  const bytes = await buildExtensionRequest(
    pdfLib as unknown as Parameters<typeof buildExtensionRequest>[0],
    extensionRequestPdfData(row),
  );
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export function extensionRequestPdfPath(row: ExtensionRequestRow): string {
  return `${row.operator_id}/${row.event_id}/extension-${row.id}.pdf`;
}

/**
 * Renders and stores the PDF for a request. `pdf_path` and `generated_at` are
 * part of the body the append-only trigger freezes, so this only ever runs
 * while the request is a draft — a filed request re-renders to a signed URL
 * off its stored path.
 */
export async function generateAndStoreExtensionPdf(
  row: ExtensionRequestRow,
): Promise<{ path: string } | { error: string }> {
  const blob = await renderExtensionRequestBlob(row);
  const path = extensionRequestPdfPath(row);
  const upload = await uploadToBucket(ELD_NOTICE_BUCKET, path, blob, {
    upsert: true, contentType: 'application/pdf',
  });
  if (upload.error) return { error: upload.error.message };

  const { error } = await supabase
    .from('eld_extension_requests')
    .update({ pdf_path: path, generated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return { error: error.message };
  return { path };
}

export async function openExtensionRequestPdf(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(ELD_NOTICE_BUCKET)
    .createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}