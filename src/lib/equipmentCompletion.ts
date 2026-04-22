/**
 * Shared completion helpers for Stage 5 — Equipment Setup.
 *
 * The ELD requirement is satisfied when the device is installed
 * OR when the truck is marked ELD Exempt (pre-2000, FMCSA §395.8(a)(1)(iii)).
 * When exempt, the operator runs paper logs and no ELD/Dash Cam serial is required.
 */

export interface EquipmentStatusLike {
  decal_applied?: string | null;
  eld_installed?: string | null;
  fuel_card_issued?: string | null;
  eld_exempt?: boolean | null;
  eld_serial_number?: string | null;
  dash_cam_number?: string | null;
  bestpass_number?: string | null;
  fuel_card_number?: string | null;
}

/** True when ELD is installed OR the truck is exempt. */
export function isEldRequirementMet(s: EquipmentStatusLike): boolean {
  return s.eld_exempt === true || s.eld_installed === 'yes';
}

/**
 * Stage 5 (install-only) completion — used for stage-status badges and
 * the EQUIP pipeline dot. Does not require device serials to be filled.
 */
export function isEquipmentInstallComplete(s: EquipmentStatusLike): boolean {
  return (
    s.decal_applied === 'yes' &&
    s.fuel_card_issued === 'yes' &&
    isEldRequirementMet(s)
  );
}

/**
 * Full Stage 5 completion — install + all assigned device numbers populated.
 * When eld_exempt is true, ELD serial and Dash Cam are not required.
 */
export function isEquipmentFullyComplete(s: EquipmentStatusLike): boolean {
  if (!isEquipmentInstallComplete(s)) return false;
  const eldDevicesOk = s.eld_exempt === true
    ? true
    : !!s.eld_serial_number && !!s.dash_cam_number;
  return eldDevicesOk && !!s.bestpass_number && !!s.fuel_card_number;
}

/** True if the truck year parses as a pre-2000 year — used only as a UI hint. */
export function looksPre2000(truckYear: string | null | undefined): boolean {
  if (!truckYear) return false;
  const y = parseInt(truckYear, 10);
  return Number.isFinite(y) && y > 1900 && y < 2000;
}

export const ELD_EXEMPT_DEFAULT_REASON =
  'Pre-2000 truck — paper logs in use under FMCSA §395.8(a)(1)(iii)';