-- ============================================================================
-- Migration 0165 — Audit-log every change to platform_settings.
--
-- Prompted by a real gap this exposed: db_cap_mb was briefly 1 (instead of
-- 500) at the exact moment the resource-usage cron ran on 2026-08-31,
-- triggering a legitimate-but-alarming "database at 1958.9%" email, then
-- was corrected back to 500 seconds later — and there was no way to trace
-- who or what changed it, since platform_settings writes were never
-- audit-logged at all (only reads were permission-gated).
--
-- A trigger, not a service-layer log_audit() call, so every write path is
-- covered — the existing settings-page save, any future admin tooling, and
-- direct SQL edits alike — rather than depending on each call site
-- remembering to log itself (same reasoning branches/members/matters
-- already follow via their own triggers).
--
-- Diffs old vs new column-by-column (skips `updated_at`, which changes on
-- every save regardless) and logs nothing when nothing meaningful changed.
-- ============================================================================

create or replace function public.log_platform_settings_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_changed_keys text;
begin
  for v_key in select jsonb_object_keys(v_new) loop
    if v_key = 'updated_at' then continue; end if;
    if v_old -> v_key is distinct from v_new -> v_key then
      -- smtp holds mail-server credentials — record that it changed, never
      -- the actual before/after payload (which can include a password).
      if v_key = 'smtp' then
        v_changes := v_changes || jsonb_build_object(v_key, '"[redacted]"'::jsonb);
      else
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end if;
  end loop;

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  select string_agg(k, ', ' order by k) into v_changed_keys from jsonb_object_keys(v_changes) as k;

  perform public.log_audit(
    p_org := null,
    p_action := 'platform_settings.updated',
    p_entity_type := 'platform_settings',
    p_summary := 'Platform settings changed: ' || v_changed_keys,
    p_metadata := v_changes,
    p_platform := true
  );

  return new;
end;
$$;

drop trigger if exists trg_log_platform_settings_update on public.platform_settings;
create trigger trg_log_platform_settings_update
  after update on public.platform_settings
  for each row execute function public.log_platform_settings_update();
