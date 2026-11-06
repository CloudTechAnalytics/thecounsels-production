-- ============================================================================
-- Firm isolation test — WRITE side. Run on TESTING only (it creates a
-- temporary second firm and user inside the transaction, then rolls back).
--
-- An intruder — the Managing Partner of a brand-new "Firm B", with every
-- permission in their own firm and the Business plan — tries to reach into
-- Firm A: insert rows carrying Firm A's id, update and delete Firm A's rows,
-- and call the sensitive functions with Firm A's ids. Every attempt must be
-- refused (an error, or 0 rows touched). Firm A's members must also not see
-- anything Firm B creates.
--
-- Run:  supabase db query -f supabase/tests/firm_isolation_write.sql
-- Result is raised as  RESULTS:{...}
-- ============================================================================
do $$
declare
  a_org uuid := (select id from public.organizations where organization_type is distinct from 'demo' order by created_at limit 1);
  a_user uuid := (select m.user_id from public.memberships m where m.organization_id = (select id from public.organizations where organization_type is distinct from 'demo' order by created_at limit 1) and m.status = 'active' limit 1);
  b_org uuid := gen_random_uuid();
  b_user uuid := gen_random_uuid();
  a_matter uuid; a_client uuid; a_emp uuid; a_fund uuid; a_doc uuid; a_leave uuid; a_hr uuid;
  b_client uuid;
  n bigint;
  ok int := 0;
  leaks jsonb := '[]'::jsonb;
  biz uuid := (select id from public.plans where key = 'business');
  mp uuid := (select id from public.roles where key = 'managing_partner' limit 1);
  attempt text;

  procedure_ok boolean;
begin
  select id into a_matter from public.matters where organization_id = a_org limit 1;
  select id into a_client from public.clients where organization_id = a_org limit 1;
  select id into a_emp from public.employees where organization_id = a_org limit 1;
  select id into a_fund from public.fund_requests where organization_id = a_org limit 1;
  select id into a_doc from public.documents where organization_id = a_org limit 1;
  select id into a_leave from public.leave_requests where organization_id = a_org limit 1;
  select id into a_hr from public.hr_requests where organization_id = a_org limit 1;

  -- Firm B and its Managing Partner (all rolled back at the end).
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (b_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'isolation-test-' || b_user || '@example.invalid', '', now(), '{"full_name":"Intruder"}', now(), now());
  insert into public.organizations (id, name, slug, organization_type) values (b_org, 'Isolation Test Firm B', 'iso-test-' || substr(b_org::text, 1, 8), 'customer');
  insert into public.memberships (organization_id, user_id, role_id, status, is_owner, access_scope) values (b_org, b_user, mp, 'active', true, 'organization');
  insert into public.subscriptions (organization_id, plan_id, status) values (b_org, biz, 'active')
  on conflict (organization_id) do update set plan_id = excluded.plan_id, status = 'active';

  perform set_config('request.jwt.claims', json_build_object('sub', b_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- Firm B works normally in its own firm (proves the intruder is a real, capable user).
  insert into public.clients (organization_id, display_name, type) values (b_org, 'Firm B own client', 'individual') returning id into b_client;

  -- Helper pattern: each attempt must raise, or touch 0 rows.
  -- 1. Writes carrying Firm A's id.
  foreach attempt in array array[
    format('insert into public.clients (organization_id, display_name, type) values (%L, %L, %L)', a_org, 'planted', 'individual'),
    format('insert into public.matters (organization_id, title, client_id) values (%L, %L, %L)', a_org, 'planted', a_client),
    format('insert into public.tasks (organization_id, title) values (%L, %L)', a_org, 'planted'),
    format('insert into public.employees (organization_id, first_name, last_name, employee_number) values (%L, %L, %L, %L)', a_org, 'Planted', 'Person', ''),
    format('insert into public.hr_announcements (organization_id, title, body) values (%L, %L, %L)', a_org, 'planted', 'x'),
    format('insert into public.inventory_items (organization_id, kind, name) values (%L, %L, %L)', a_org, 'supply', 'planted'),
    format('insert into public.power_sources (organization_id, kind, name) values (%L, %L, %L)', a_org, 'grid', 'planted'),
    format('insert into public.appraisal_cycles (organization_id, name, period_start, period_end) values (%L, %L, %L, %L)', a_org, 'planted', '2026-01-01', '2026-12-31'),
    format('insert into public.payroll_runs (organization_id, period) values (%L, %L)', a_org, '2031-01-01'),
    format('insert into public.public_holidays (organization_id, holiday_date, name) values (%L, %L, %L)', a_org, '2031-01-01', 'planted'),
    format('insert into public.approval_rules (organization_id, area, approver_roles) values (%L, %L, %L)', a_org, 'leave', '{managing_partner}'),
    format('update public.clients set display_name = %L where id = %L', 'hijacked', a_client),
    format('update public.matters set title = %L where id = %L', 'hijacked', a_matter),
    format('update public.employees set first_name = %L where id = %L', 'hijacked', a_emp),
    format('update public.organizations set name = %L where id = %L', 'hijacked', a_org),
    format('delete from public.clients where id = %L', a_client),
    format('delete from public.documents where id = %L', a_doc),
    format('delete from public.memberships where organization_id = %L', a_org),
    -- 2. Functions called with Firm A's ids.
    format('select public.request_leave(%L, (select id from public.leave_types where organization_id = %L limit 1), %L, %L)', a_org, a_org, '2031-02-03', '2031-02-03'),
    format('select public.review_leave_request(%L, true)', a_leave),
    format('select public.save_fund_request(%L, %L, %L, 1000)', a_org, 'planted', 'transport'),
    format('select public.send_circular(%L, %L, %L, %L)', a_org, 'planted', 'x', 'organization'),
    format('select public.request_inventory(%L, null, %L, 1)', a_org, 'planted'),
    format('select public.save_survey(%L, null, %L, null, true, null, %L, null, null, null, null, %L)', a_org, 'planted', 'organization', '[]'),
    format('select public.set_line_managers(%L, array[%L]::uuid[], null)', a_org, a_emp),
    format('select public.set_additional_line_managers(%L, %L, array[]::uuid[])', a_org, a_emp),
    format('select public.recommend_hr_request(%L, true, %L)', a_hr, 'x'),
    format('select public.leave_preview(%L, (select id from public.leave_types where organization_id = %L limit 1), %L, %L)', a_org, a_org, '2031-02-03', '2031-02-04'),
    format('select public.set_org_feature(%L, %L, true)', a_org, 'payroll')
  ] loop
    begin
      execute attempt;
      get diagnostics n = row_count;
      -- A select of a function that returned without error is a leak; an update/delete must touch 0 rows.
      if attempt like 'select%' or attempt like 'insert%' or n > 0 then
        leaks := leaks || jsonb_build_object('attempt', left(attempt, 160), 'rows', n);
      else
        ok := ok + 1;
      end if;
    exception when others then
      ok := ok + 1;
    end;
  end loop;

  -- 3. Firm A's member must not see Firm B's client.
  perform set_config('request.jwt.claims', json_build_object('sub', a_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.clients where id = b_client;
  if n > 0 then leaks := leaks || jsonb_build_object('attempt', 'Firm A reads Firm B client', 'rows', n); else ok := ok + 1; end if;

  -- 4. And nothing of Firm A was actually changed.
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.clients where organization_id = a_org and display_name in ('planted', 'hijacked');
  if n > 0 then leaks := leaks || jsonb_build_object('attempt', 'Firm A data changed', 'rows', n); else ok := ok + 1; end if;

  raise exception 'RESULTS:%', jsonb_build_object('ok', jsonb_array_length(leaks) = 0, 'attempts_refused', ok, 'leaks', leaks,
    'firm_a_had', jsonb_build_object('matter', a_matter is not null, 'client', a_client is not null, 'employee', a_emp is not null,
      'fund', a_fund is not null, 'document', a_doc is not null, 'leave', a_leave is not null, 'hr_request', a_hr is not null));
end $$;
