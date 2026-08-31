-- ============================================================================
-- Migration 0159 — Daily cron trigger for check-resource-usage, same
-- established pattern as dispatch_task_notification: read project_url and
-- service_role_key from Vault (already seeded on both projects for the
-- reminder engine / keep-alive ping), POST to the edge function with that
-- key as bearer. Runs once a day — resource usage does not move fast
-- enough to need more, and internal_check_resource_alert()'s own
-- band-tracking means a wasted daily call when nothing's changed is cheap
-- (one fast function call, no email sent).
-- ============================================================================

create or replace function public.trigger_resource_usage_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  svc_key text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if base_url is null or svc_key is null then
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/check-resource-usage',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('check-resource-usage-daily', '0 6 * * *', $$select public.trigger_resource_usage_check();$$);
