-- The wizard's return list offers eld, dash_cam, bestpass, license_plate and
-- fuel_card. Only fuel_card was missing from osas_device_type, so any driver
-- holding a fuel card failed the equipment return step. equipment_items.device_type
-- is plain text and carries exactly these four values live: bestpass, dash_cam,
-- eld, fuel_card — all of which osas_device_type now accepts.
ALTER TYPE public.osas_device_type ADD VALUE IF NOT EXISTS 'fuel_card';