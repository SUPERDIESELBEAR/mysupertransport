
ALTER TABLE public.contractor_pay_setup
  ADD COLUMN IF NOT EXISTS deposit_overview_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_calendar_acknowledged boolean NOT NULL DEFAULT false;
