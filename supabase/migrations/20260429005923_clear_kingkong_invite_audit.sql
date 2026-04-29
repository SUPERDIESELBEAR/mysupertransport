-- One-time cleanup: clear King Kong's prior superdrive invite audit row
-- so we can resend the new binder-focused template for testing.
DELETE FROM public.audit_log
WHERE action = 'superdrive_invite_sent'
  AND entity_type = 'operator'
  AND entity_id = 'd0e1ba38-2755-4baa-8634-e12ee40d72fe';
