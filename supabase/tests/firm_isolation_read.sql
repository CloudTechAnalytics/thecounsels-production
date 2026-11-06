-- ============================================================================
-- Firm isolation test — READ side. Safe on production: it only counts.
--
-- For every active member of every firm (platform admins excluded — they are
-- meant to see everything), sign in as that person and count, in every table,
-- rows that belong to a firm they are NOT a member of. Every count must be 0.
-- Covers the tables keyed by organization_id, the child tables that reach a
-- firm through a parent, profiles/signatures, and stored files.
--
-- Run:  supabase db query -f supabase/tests/firm_isolation_read.sql
-- (wrapped in a READ ONLY transaction that is rolled back — Postgres refuses any write)
-- Result is raised as  RESULTS:{...}  (ok + any violations).
-- ============================================================================
start transaction read only;

do $$
declare
  u record;
  t text;
  n bigint;
  v_orgs uuid[];
  users jsonb := '[]'::jsonb;
  tables text[];
  violations jsonb := '[]'::jsonb;
  checks int := 0;
  denied int := 0;
  tested_users int := 0;
  child_checks text[][] := array[
    -- table, SQL returning the firm of each visible row
    array['survey_questions',        'select s.organization_id from public.survey_questions x join public.surveys s on s.id = x.survey_id'],
    array['survey_responses',        'select s.organization_id from public.survey_responses x join public.surveys s on s.id = x.survey_id'],
    array['survey_answers',          'select s.organization_id from public.survey_answers x join public.survey_responses r on r.id = x.response_id join public.surveys s on s.id = r.survey_id'],
    array['appraisal_scores',        'select a.organization_id from public.appraisal_scores x join public.appraisals a on a.id = x.appraisal_id'],
    array['appraisal_goals',         'select a.organization_id from public.appraisal_goals x join public.appraisals a on a.id = x.appraisal_id'],
    array['appraisal_inputs',        'select a.organization_id from public.appraisal_inputs x join public.appraisals a on a.id = x.appraisal_id'],
    array['support_ticket_messages', 'select t.organization_id from public.support_ticket_messages x join public.support_tickets t on t.id = x.ticket_id'],
    array['channel_reads',           'select c.organization_id from public.channel_reads x join public.channels c on c.id = x.channel_id'],
    array['invitation_branches',     'select i.organization_id from public.invitation_branches x join public.invitations i on i.id = x.invitation_id']
  ];
  c text[];
begin
  -- Everyone to test, and the firms each belongs to (read as the owner role).
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'orgs', m.orgs)), '[]'::jsonb) into users
  from (
    select m.user_id, array_agg(distinct m.organization_id) as orgs
    from public.memberships m join public.profiles p on p.id = m.user_id
    where m.status = 'active' and not coalesce(p.is_platform_admin, false)
    group by m.user_id
  ) m;

  select array_agg(c.table_name::text order by c.table_name) into tables
  from information_schema.columns c
  join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
  where c.table_schema = 'public' and c.column_name = 'organization_id';

  for u in select (x->>'user_id')::uuid as user_id, array(select jsonb_array_elements_text(x->'orgs'))::uuid[] as orgs from jsonb_array_elements(users) x loop
    tested_users := tested_users + 1;
    v_orgs := u.orgs;
    perform set_config('request.jwt.claims', json_build_object('sub', u.user_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- 1. Tables keyed by organization_id.
    foreach t in array tables loop
      checks := checks + 1;
      begin
        execute format('select count(*) from public.%I where organization_id is not null and not (organization_id = any ($1))', t) into n using v_orgs;
        if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', t, 'foreign_rows', n); end if;
      exception when insufficient_privilege then denied := denied + 1;
      end;
    end loop;

    -- 2. Child tables, via their parent's firm.
    foreach c slice 1 in array child_checks loop
      checks := checks + 1;
      begin
        execute format('select count(*) from (%s) q where not (q.organization_id = any ($1))', c[2]) into n using v_orgs;
        if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', c[1], 'foreign_rows', n); end if;
      exception when insufficient_privilege then denied := denied + 1;
      end;
    end loop;

    -- 3. Firms, people and signatures outside my firms.
    checks := checks + 3;
    select count(*) into n from public.organizations o where not (o.id = any (v_orgs));
    if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', 'organizations', 'foreign_rows', n); end if;
    begin
      select count(*) into n from public.profiles p
      where p.id <> u.user_id and not exists (select 1 from public.memberships m where m.user_id = p.id and m.organization_id = any (v_orgs));
      if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', 'profiles', 'foreign_rows', n); end if;
    exception when insufficient_privilege then denied := denied + 1;
    end;
    begin
      select count(*) into n from public.user_signatures s
      where s.user_id <> u.user_id and not exists (select 1 from public.memberships m where m.user_id = s.user_id and m.organization_id = any (v_orgs));
      if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', 'user_signatures', 'foreign_rows', n); end if;
    exception when insufficient_privilege then denied := denied + 1;
    end;

    -- 4. Stored files whose path starts with another firm's id.
    checks := checks + 1;
    begin
      select count(*) into n from storage.objects o
      where split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$'
        and exists (select 1 from public.organizations x where x.id::text = split_part(o.name, '/', 1))
        and not (split_part(o.name, '/', 1)::uuid = any (v_orgs));
      if n > 0 then violations := violations || jsonb_build_object('user', u.user_id, 'table', 'storage.objects', 'foreign_rows', n); end if;
    exception when insufficient_privilege then denied := denied + 1;
    end;

    perform set_config('role', 'postgres', true);
  end loop;

  raise exception 'RESULTS:%', jsonb_build_object(
    'ok', jsonb_array_length(violations) = 0,
    'users_tested', tested_users, 'firms', (select count(*) from public.organizations),
    'checks_run', checks, 'no_access_at_all', denied, 'violations', violations);
end $$;

rollback;
