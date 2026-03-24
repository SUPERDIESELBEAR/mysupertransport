
-- Add W-9 and voided check file fields to contractor_pay_setup
ALTER TABLE public.contractor_pay_setup
  ADD COLUMN IF NOT EXISTS w9_file_name         text,
  ADD COLUMN IF NOT EXISTS w9_file_path         text,
  ADD COLUMN IF NOT EXISTS w9_url               text,
  ADD COLUMN IF NOT EXISTS void_check_file_name text,
  ADD COLUMN IF NOT EXISTS void_check_file_path text,
  ADD COLUMN IF NOT EXISTS void_check_url       text;
