-- Ensure upsert target exists for dispatch_daily_log
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_daily_log_op_date_uniq
  ON public.dispatch_daily_log (operator_id, log_date);

-- Reconcile latest calendar status -> active_dispatch for any drift
WITH latest AS (
  SELECT DISTINCT ON (operator_id) operator_id, status::text AS status_text, log_date
  FROM public.dispatch_daily_log
  WHERE log_date <= CURRENT_DATE
  ORDER BY operator_id, log_date DESC
)
INSERT INTO public.active_dispatch (operator_id, dispatch_status, updated_at)
SELECT l.operator_id, l.status_text::public.dispatch_status, now()
FROM latest l
JOIN public.operators o ON o.id = l.operator_id
WHERE o.is_active = true AND o.excluded_from_dispatch = false
ON CONFLICT (operator_id) DO UPDATE
SET dispatch_status = EXCLUDED.dispatch_status,
    updated_at = now()
WHERE active_dispatch.dispatch_status IS DISTINCT FROM EXCLUDED.dispatch_status;

-- Mirror to history for audit (only for rows we just touched)
INSERT INTO public.dispatch_status_history (operator_id, dispatch_status, status_notes)
SELECT l.operator_id, l.status_text::public.dispatch_status, 'Backfill: synced from calendar latest entry'
FROM (
  SELECT DISTINCT ON (operator_id) operator_id, status::text AS status_text, log_date
  FROM public.dispatch_daily_log
  WHERE log_date <= CURRENT_DATE
  ORDER BY operator_id, log_date DESC
) l
JOIN public.operators o ON o.id = l.operator_id
JOIN public.active_dispatch ad ON ad.operator_id = l.operator_id
WHERE o.is_active = true
  AND o.excluded_from_dispatch = false
  AND ad.dispatch_status::text = l.status_text
  AND ad.updated_at > now() - interval '5 seconds';