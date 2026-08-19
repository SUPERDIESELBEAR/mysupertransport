UPDATE public.loads SET operator_id = NULL WHERE id = 'bac3019c-62bd-4a70-9532-689c92cf880a';
UPDATE public.loads SET operator_id = 'f2051752-5311-4c1f-b88c-79773e7ed9e5' WHERE id = 'e1694447-0417-402f-8d2b-da0f917f3daa';
DELETE FROM public.audit_log WHERE action IN ('load_driver_unassigned','load_driver_assignment_override') AND created_at > now() - interval '30 minutes';
DELETE FROM public.load_status_history WHERE load_id IN ('bac3019c-62bd-4a70-9532-689c92cf880a','e1694447-0417-402f-8d2b-da0f917f3daa') AND changed_at > now() - interval '30 minutes';