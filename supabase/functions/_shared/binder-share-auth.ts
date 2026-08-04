export interface BinderShareAuthorizationInput {
  callerUserId: string;
  isStaff: boolean;
  documentScope: string;
  documentDriverId: string | null;
}

/**
 * Binder ownership is keyed by the driver's auth user ID, not operators.id.
 * Staff may share any binder; drivers may share company-wide documents and
 * per-driver documents whose driver_id matches their verified JWT subject.
 */
export function canShareBinderDocument({
  callerUserId,
  isStaff,
  documentScope,
  documentDriverId,
}: BinderShareAuthorizationInput): boolean {
  if (isStaff) return true;
  if (documentScope === 'company_wide') return true;
  return documentScope === 'per_driver' && documentDriverId === callerUserId;
}