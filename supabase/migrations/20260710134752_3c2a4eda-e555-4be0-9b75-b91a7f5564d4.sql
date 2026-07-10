-- PEI auto-cadence tracking columns + cron
ALTER TABLE public.pei_requests
  ADD COLUMN IF NOT EXISTS auto_send_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text,
  ADD COLUMN IF NOT EXISTS last_auto_send_at timestamptz;

-- Cron: run PEI auto-cadence hourly. Idempotent.
do $$
declare jid int;
begin
  for jid in select jobid from cron.job where jobname = 'pei-auto-cadence-hourly' loop
    perform cron.unschedule(jid);
  end loop;
end$$;

select cron.schedule(
  'pei-auto-cadence-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/pei-auto-cadence',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);