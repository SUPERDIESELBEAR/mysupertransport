ALTER TABLE public.pay_policies
  ALTER COLUMN charge_pay_classes SET DEFAULT jsonb_build_object(
    'linehaul','revenue',
    'fsc','revenue',
    'detention','revenue',
    'stopoff','revenue',
    'layover','revenue',
    'tonu','revenue',
    'other','revenue',
    'lumper','revenue',
    'reimbursement','reimbursement'
  );

UPDATE public.pay_policies
SET charge_pay_classes = jsonb_set(
      COALESCE(charge_pay_classes, '{}'::jsonb),
      '{lumper}',
      '"revenue"'::jsonb,
      true
    ),
    updated_at = now()
WHERE charge_pay_classes->>'lumper' = 'reimbursement';

COMMENT ON COLUMN public.pay_policies.charge_pay_classes IS
  'Charge classification key -> pay class. "revenue" splits at this policy''s percentage; "reimbursement" pays the actual cost back to whoever spent it. Lumper remains revenue by default at its existing 100% percentage; driver-paid lumper must be classified explicitly as reimbursement.';