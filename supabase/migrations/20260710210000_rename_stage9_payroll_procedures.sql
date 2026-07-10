update public.pipeline_config
set full_name = 'Payroll and Procedures',
    description = 'Stage 9 covers Payroll Setup, BOL Procedures, Handbook, and Load Out Procedures.',
    updated_at = now()
where stage_key = 'pay_setup';
