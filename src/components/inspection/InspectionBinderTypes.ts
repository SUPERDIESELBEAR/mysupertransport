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

export type DriverUploadCategory =
  | 'roadside_inspection_report'
  | 'repairs_maintenance_receipt'
  | 'miscellaneous'
  | BinderUploadCategory;

/** Binder slots a driver may propose a new version of (staff approve first). */
export const BINDER_UPLOAD_SLOTS = [
  { category: 'binder_cdl_front', docName: 'CDL (Front)', label: 'CDL (Front)' },
  { category: 'binder_cdl_back', docName: 'CDL (Back)', label: 'CDL (Back)' },
  { category: 'binder_medical', docName: 'Medical Certificate', label: 'Medical Certificate' },
  { category: 'binder_irp', docName: 'IRP Registration (cab card)', label: 'IRP Registration' },
  { category: 'binder_2290', docName: 'Form 2290', label: 'Form 2290' },
] as const;

export type BinderUploadCategory = (typeof BINDER_UPLOAD_SLOTS)[number]['category'];

const BINDER_CATEGORIES: readonly string[] = BINDER_UPLOAD_SLOTS.map(s => s.category);

export function isBinderUploadCategory(category: string): category is BinderUploadCategory {
  return BINDER_CATEGORIES.includes(category);
}

/** Binder doc name a driver-upload category proposes to replace. */
export function binderDocNameForCategory(category: string): string | null {
  return BINDER_UPLOAD_SLOTS.find(s => s.category === category)?.docName ?? null;
}

export interface DriverUpload {
  id: string;
  driver_id: string;
  category: DriverUploadCategory;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  status: 'pending_review' | 'reviewed' | 'needs_attention';
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  binder_document_id?: string | null;
  proposed_expires_at?: string | null;
  review_note?: string | null;
}

// Company-wide document slots (one per scope: company_wide)
// `optional: true` → hidden by default, only appears for drivers who opt in
export const COMPANY_WIDE_DOCS = [
  { key: 'IFTA License', hasExpiry: true },
  { key: 'Insurance', hasExpiry: true },
  { key: 'UCR', hasExpiry: true },
  { key: 'MC Authority', hasExpiry: false },
  { key: 'State Specific Permits', hasExpiry: true },
  { key: 'Overweight/Oversize Permits', hasExpiry: true, optional: true },
  { key: 'Hazmat', hasExpiry: true, optional: true },
  { key: 'ELD Procedures', hasExpiry: false },
] as const;

// Per-driver document slots
export const PER_DRIVER_DOCS = [
  { key: 'IRP Registration (cab card)', hasExpiry: true },
  { key: 'CDL (Front)', hasExpiry: true },
  { key: 'CDL (Back)', hasExpiry: true },
  { key: 'Medical Certificate', hasExpiry: true },
  { key: 'Periodic DOT Inspections', hasExpiry: true },
  { key: 'Lease Agreement (ICA)', hasExpiry: false },
  { key: 'Form 2290', hasExpiry: true },
] as const;

export type DocName =
  | (typeof COMPANY_WIDE_DOCS)[number]['key']
  | (typeof PER_DRIVER_DOCS)[number]['key'];

/** Names of company-wide docs that are hidden by default and only appear when a driver opts in */
export const OPTIONAL_COMPANY_DOCS: string[] = COMPANY_WIDE_DOCS
  .filter(d => 'optional' in d && (d as any).optional)
  .map(d => d.key);

/** Returns true if a company doc is opt-in (hidden by default) */
export function isOptionalCompanyDoc(name: string): boolean {
  return OPTIONAL_COMPANY_DOCS.includes(name);
}

/**
 * Filter a list of doc keys, removing optional company docs unless the driver has opted in.
 * Pass `enabledOptional` as the set of doc names this driver has explicitly opted into.
 * If `enabledOptional` is null/undefined, ALL optional docs are excluded.
 */
export function filterOptionalDocs<T extends string>(
  keys: T[],
  enabledOptional?: Set<string> | null,
): T[] {
  return keys.filter(k => {
    if (!isOptionalCompanyDoc(k)) return true;
    return !!enabledOptional && enabledOptional.has(k);
  });
}

/** Parse a YYYY-MM-DD date string as local midnight (not UTC) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getExpiryStatus(expiresAt: string | null): 'valid' | 'expiring_soon' | 'expired' | null {
  if (!expiresAt) return null;
  const days = Math.ceil((parseLocalDate(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'valid';
}

export function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((parseLocalDate(expiresAt).getTime() - Date.now()) / 86400000);
}

/** Format a day count into a human-readable Xy Xm Xd string */
export function formatDaysHuman(totalDays: number): string {
  const abs = Math.abs(totalDays);
  const years = Math.floor(abs / 365);
  const months = Math.floor((abs % 365) / 30);
  const days = abs % 30;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (days > 0 || parts.length === 0) parts.push(`${days}d`);
  return parts.join(' ');
}
