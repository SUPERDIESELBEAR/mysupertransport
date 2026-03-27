export interface InspectionDocument {
  id: string;
  name: string;
  scope: 'company_wide' | 'per_driver';
  driver_id: string | null;
  file_url: string | null;
  file_path: string | null;
  public_share_token: string;
  expires_at: string | null;
  uploaded_at: string;
  updated_at: string;
  uploaded_by: string | null;
  shared_with_fleet: boolean;
}

export interface DriverUpload {
  id: string;
  driver_id: string;
  category: 'roadside_inspection_report' | 'repairs_maintenance_receipt' | 'miscellaneous';
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  status: 'pending_review' | 'reviewed' | 'needs_attention';
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

// Company-wide document slots (one per scope: company_wide)
export const COMPANY_WIDE_DOCS = [
  { key: 'IFTA License', hasExpiry: true },
  { key: 'Insurance', hasExpiry: true },
  { key: 'UCR', hasExpiry: true },
  { key: 'MC Authority', hasExpiry: false },
  { key: 'State Specific Permits', hasExpiry: true },
  { key: 'Overweight/Oversize Permits', hasExpiry: true },
  { key: 'Hazmat', hasExpiry: true },
  { key: 'ELD Procedures', hasExpiry: false },
  { key: 'Accident Packet', hasExpiry: false },
] as const;

// Per-driver document slots
export const PER_DRIVER_DOCS = [
  { key: 'IRP Registration (cab card)', hasExpiry: true },
  { key: 'CDL (Front)', hasExpiry: true },
  { key: 'CDL (Back)', hasExpiry: true },
  { key: 'Medical Certificate', hasExpiry: true },
  { key: 'DOT Inspections', hasExpiry: true },
  { key: 'Lease Agreement', hasExpiry: false },
] as const;

export type DocName =
  | (typeof COMPANY_WIDE_DOCS)[number]['key']
  | (typeof PER_DRIVER_DOCS)[number]['key'];

export function getExpiryStatus(expiresAt: string | null): 'valid' | 'expiring_soon' | 'expired' | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'valid';
}

export function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}
