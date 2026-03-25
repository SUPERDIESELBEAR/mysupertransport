
ALTER TABLE public.contractor_pay_setup
  ADD COLUMN IF NOT EXISTS deposit_overview_acknowledged_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payroll_calendar_acknowledged_at TIMESTAMP WITH TIME ZONE;
