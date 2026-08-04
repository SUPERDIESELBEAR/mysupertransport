import { describe, expect, it } from 'vitest';
import { canShareBinderDocument } from '../../supabase/functions/_shared/binder-share-auth';

describe('binder share authorization', () => {
  const callerUserId = 'driver-user-1';

  it('allows a driver to share their own document', () => {
    expect(canShareBinderDocument({
      callerUserId,
      isStaff: false,
      documentScope: 'per_driver',
      documentDriverId: callerUserId,
    })).toBe(true);
  });

  it('allows a driver to share a company-wide document', () => {
    expect(canShareBinderDocument({
      callerUserId,
      isStaff: false,
      documentScope: 'company_wide',
      documentDriverId: null,
    })).toBe(true);
  });

  it("rejects another driver's document", () => {
    expect(canShareBinderDocument({
      callerUserId,
      isStaff: false,
      documentScope: 'per_driver',
      documentDriverId: 'driver-user-2',
    })).toBe(false);
  });

  it('allows authorized staff to share any binder document', () => {
    expect(canShareBinderDocument({
      callerUserId: 'staff-user',
      isStaff: true,
      documentScope: 'per_driver',
      documentDriverId: 'driver-user-2',
    })).toBe(true);
  });

  it('derives ownership only from the verified caller user ID', () => {
    expect(canShareBinderDocument({
      callerUserId,
      isStaff: false,
      documentScope: 'per_driver',
      documentDriverId: 'caller-supplied-alternative-owner',
    })).toBe(false);
  });
});