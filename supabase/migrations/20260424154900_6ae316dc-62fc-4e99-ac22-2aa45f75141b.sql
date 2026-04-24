-- Step 1: Clean up dependent rows for orphan operator ec79e22f-3001-4e5b-b8d1-7347e7a4c718
DELETE FROM public.driver_vault_documents WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.operator_documents WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.ica_contracts WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.contractor_pay_setup WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.active_dispatch WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.dispatch_status_history WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.dispatch_daily_log WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.onboarding_status WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.documents WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.equipment_assignments WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';
DELETE FROM public.cert_reminders WHERE operator_id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';

-- Delete the orphan operator itself
DELETE FROM public.operators WHERE id = 'ec79e22f-3001-4e5b-b8d1-7347e7a4c718';

-- Delete the orphan application
DELETE FROM public.applications WHERE id = '566e9b11-b29c-4d16-a47a-7aa14b5e8902';

-- Step 2: Rename the real account — strip "(Test)" suffix and use the canonical email
UPDATE public.applications
SET email = 'marcsmueller@gmail.com',
    last_name = 'Mueller'
WHERE id = 'a364e0e6-2cfe-455c-80ab-12d5270719fa';

-- Step 3: Mark Stage 2 truck photos as received (triggers vault copy + notification)
UPDATE public.onboarding_status
SET truck_photos = 'received',
    updated_at = now()
WHERE operator_id = 'ee993ec0-e0a2-4d0f-aa05-6d22eb931405';