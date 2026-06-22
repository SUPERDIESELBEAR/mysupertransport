-- Idempotent: drop any previous schedule, then re-create.
do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'cron-cert-reminders-daily' loop
    perform cron.unschedule(jid);
  end loop;
end$$;

select cron.schedule(
  'cron-cert-reminders-daily',
  '0 15 * * *',
  $$
  select net.http_post(
    url     := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/cron-cert-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);