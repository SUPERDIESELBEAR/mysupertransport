import type { DeviceType } from './EquipmentInventory';

export const DEVICE_CONFIG_LABELS: Record<DeviceType, string> = {
  eld:       'ELD',
  dash_cam:  'Dash Camera',
  bestpass:  'BestPass',
  fuel_card: 'Fuel Card',
};
