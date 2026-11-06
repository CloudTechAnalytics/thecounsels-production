-- ============================================================================
-- Migration 0199 — Performance appraisals.
--
-- appraisal_cycles    e.g. "2026 Annual Review": period, due dates, audience
--                     (whole firm / branch / department) and the competencies
--                     everyone is rated on (1–5).
-- appraisals          one per staff member per cycle. Stages:
--                       self_review    → the staff member rates themselves
--                       manager_review → their (primary) line manager rates
--                       sign_off       → HR / Managing Partner: final rating
--                                        and recommendation
--                       acknowledge    → the staff member reads it, agrees or
--                                        not, comments, optionally e-signs
--                       completed
-- appraisal_scores    per competency: self and manager rating + comment.
-- appraisal_goals     the person's objectives for the period, rated by both.
-- appraisal_inputs    additional line managers add their view (confidential
--                     to the reviewing manager and HR).
--
-- Who sees what is enforced in get_appraisal(): self drafts are private
-- until submitted; the manager's ratings reach the staff member only once
-- signed off; nobody signs off their own appraisal. The detail tables are
-- not readable directly, and appraisals exposes only workflow columns.
-- Appraisal managers = 'appraisals.manage' (Managing Partner, HR roles).
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('appraisals.manage', 'appraisals', 'manage', 'Run appraisal cycles, see all appraisals and sign them off')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'appraisals.manage'
where r.key in ('managing_partner', 'hr_manager', 'hr_administrator', 'hr')
on conflict do nothing;

create table if not exists public.appraisal_cycles (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  name                   text not null check (length(trim(name)) between 1 and 160),
  period_start           date not null,
  period_end             date not null,
  self_due               date,
  manager_due            date,
  audience_type          text not null default 'organization' check (audience_type in ('organization', 'branch', 'department')),
  audience_branch_id     uuid references public.branches(id) on delete set null,
  audience_department_id uuid references public.departments(id) on delete set null,
  competencies           jsonb not null default '[]'::jsonb,
  status                 text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  launched_at            timestamptz,
  closed_at              timestamptz,
  created_by             uuid default auth.uid() references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists idx_appraisal_cycles_org on public.appraisal_cycles (organization_id, created_at desc);

create table if not exists public.appraisals (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  cycle_id              uuid not null references public.appraisal_cycles(id) on delete cascade,
  employee_id           uuid not null references public.employees(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  branch_id             uuid references public.branches(id) on delete set null,
  manager_user_id       uuid references auth.users(id) on delete set null,
  status                text not null default 'self_review' check (status in ('self_review', 'manager_review', 'sign_off', 'acknowledge', 'completed')),
  self_summary          text,
  self_overall          smallint check (self_overall between 1 and 5),
  self_submitted_at     timestamptz,
  manager_summary       text,
  manager_overall       smallint check (manager_overall between 1 and 5),
  manager_recommendation text,
  manager_submitted_at  timestamptz,
  final_rating          smallint check (final_rating between 1 and 5),
  recommendation        text,
  sign_off_comment      text,
  signed_off_by         uuid references auth.users(id) on delete set null,
  signed_off_at         timestamptz,
  employee_agrees       boolean,
  employee_comment      text,
  employee_signed       boolean not null default false,
  acknowledged_at       timestamptz,
  reminded_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (cycle_id, employee_id)
);
create index if not exists idx_appraisals_user on public.appraisals (user_id);
create index if not exists idx_appraisals_manager on public.appraisals (manager_user_id);
create index if not exists idx_appraisals_cycle on public.appraisals (cycle_id, status);

create table if not exists public.appraisal_scores (
  appraisal_id    uuid not null references public.appraisals(id) on delete cascade,
  competency      integer not null,
  self_rating     smallint check (self_rating between 1 and 5),
  self_comment    text,
  manager_rating  smallint check (manager_rating between 1 and 5),
  manager_comment text,
  primary key (appraisal_id, competency)
);

create table if not exists public.appraisal_goals (
  id              uuid primary key default gen_random_uuid(),
  appraisal_id    uuid not null references public.appraisals(id) on delete cascade,
  position        integer not null,
  title           text not null check (length(trim(title)) between 1 and 300),
  self_rating     smallint check (self_rating between 1 and 5),
  self_comment    text,
  manager_rating  smallint check (manager_rating between 1 and 5),
  manager_comment text
);
create index if not exists idx_appraisal_goals on public.appraisal_goals (appraisal_id, position);

create table if not exists public.appraisal_inputs (
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       smallint check (rating between 1 and 5),
  comment      text not null check (length(trim(comment)) between 1 and 4000),
  updated_at   timestamptz not null default now(),
  primary key (appraisal_id, user_id)
);

-- Helpers -------------------------------------------------------------------
create or replace function public.is_appraisal_manager(p_org uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'appraisals.manage') and public.user_has_branch_access(p_org, p_branch);
$$;
grant execute on function public.is_appraisal_manager(uuid, uuid) to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.appraisal_cycles enable row level security;
alter table public.appraisals enable row level security;
alter table public.appraisal_scores enable row level security;
alter table public.appraisal_goals enable row level security;
alter table public.appraisal_inputs enable row level security;

drop policy if exists appraisal_cycles_select on public.appraisal_cycles;
create policy appraisal_cycles_select on public.appraisal_cycles
  for select using (
    public.has_permission(organization_id, 'appraisals.manage')
    or exists (select 1 from public.appraisals a where a.cycle_id = appraisal_cycles.id
               and (a.user_id = auth.uid() or public.is_line_manager_of(a.organization_id, a.user_id, auth.uid()) or a.manager_user_id = auth.uid()))
  );
drop policy if exists appraisal_cycles_write on public.appraisal_cycles;
create policy appraisal_cycles_write on public.appraisal_cycles
  for all using (public.has_permission(organization_id, 'appraisals.manage') and status = 'draft')
  with check (public.has_permission(organization_id, 'appraisals.manage') and status = 'draft' and public.org_has_feature(organization_id, 'hr_module'));
grant select, insert, update, delete on public.appraisal_cycles to authenticated;

drop policy if exists appraisals_select on public.appraisals;
create policy appraisals_select on public.appraisals
  for select using (
    user_id = auth.uid() or manager_user_id = auth.uid()
    or public.is_line_manager_of(organization_id, user_id, auth.uid())
    or public.is_appraisal_manager(organization_id, branch_id)
  );
-- Only workflow columns are readable directly; ratings and comments come from get_appraisal().
revoke select on public.appraisals from authenticated;
grant select (id, organization_id, cycle_id, employee_id, user_id, branch_id, manager_user_id, status,
  self_submitted_at, manager_submitted_at, signed_off_at, acknowledged_at, created_at, updated_at) on public.appraisals to authenticated;
-- appraisal_scores / goals / inputs: no policies, so no direct reads — get_appraisal() only.

-- Launch a cycle ------------------------------------------------------------
create or replace function public.launch_appraisal_cycle(p_cycle uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c public.appraisal_cycles; v_n integer;
begin
  select * into c from public.appraisal_cycles where id = p_cycle for update;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'This cycle has already been launched'; end if;
  if jsonb_array_length(c.competencies) = 0 then raise exception 'Add at least one competency'; end if;
  if c.audience_type = 'branch' and c.audience_branch_id is null then raise exception 'Choose the branch'; end if;
  if c.audience_type = 'department' and c.audience_department_id is null then raise exception 'Choose the department'; end if;

  insert into public.appraisals (organization_id, cycle_id, employee_id, user_id, branch_id, manager_user_id)
  select c.organization_id, c.id, e.id, e.user_id, e.branch_id, public.line_manager_user(c.organization_id, e.user_id)
  from public.employees e
  join public.memberships m on m.organization_id = e.organization_id and m.user_id = e.user_id and m.status = 'active'
  where e.organization_id = c.organization_id and e.user_id is not null
    and e.employment_status in ('active', 'probation', 'on_leave')
    and (c.audience_type = 'organization'
         or (c.audience_type = 'branch' and e.branch_id = c.audience_branch_id)
         or (c.audience_type = 'department' and e.department_id = c.audience_department_id))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nobody with a login matches this cycle''s audience'; end if;

  update public.appraisal_cycles set status = 'open', launched_at = now(), updated_at = now() where id = c.id;
  perform public.notify_user(c.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.started', 'appraisal', a.id,
    'Your ' || c.name || ' self-appraisal is ready' || coalesce(' — due ' || to_char(c.self_due, 'DD Mon'), ''), 'info'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.user_id <> auth.uid();
  perform public.log_audit(c.organization_id, 'appraisal_cycle.launched', 'appraisal_cycle', c.id, 'Launched ' || c.name, jsonb_build_object('appraisals', v_n));
  return v_n;
end;
$$;
grant execute on function public.launch_appraisal_cycle(uuid) to authenticated;

create or replace function public.close_appraisal_cycle(p_cycle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.appraisal_cycles;
begin
  select * into c from public.appraisal_cycles where id = p_cycle;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  update public.appraisal_cycles set status = 'closed', closed_at = now(), updated_at = now() where id = p_cycle and status = 'open';
end;
$$;
grant execute on function public.close_appraisal_cycle(uuid) to authenticated;

-- Shared: save per-competency scores and goals for one side ('self' | 'manager').
-- p_scores: [{competency, rating, comment}]   p_goals: [{id?, title, rating, comment}]
create or replace function public.appraisal_save_side(p_id uuid, p_side text, p_scores jsonb, p_goals jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s jsonb; g jsonb; i integer := 0; v_keep uuid[] := '{}'; v_gid uuid;
begin
  for s in select * from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) loop
    insert into public.appraisal_scores (appraisal_id, competency) values (p_id, (s->>'competency')::int) on conflict do nothing;
    if p_side = 'self' then
      update public.appraisal_scores set self_rating = nullif(s->>'rating', '')::smallint, self_comment = nullif(trim(coalesce(s->>'comment', '')), '')
      where appraisal_id = p_id and competency = (s->>'competency')::int;
    else
      update public.appraisal_scores set manager_rating = nullif(s->>'rating', '')::smallint, manager_comment = nullif(trim(coalesce(s->>'comment', '')), '')
      where appraisal_id = p_id and competency = (s->>'competency')::int;
    end if;
  end loop;

  if p_goals is null then return; end if;
  for g in select * from jsonb_array_elements(p_goals) loop
    i := i + 1;
    continue when coalesce(trim(g->>'title'), '') = '';
    v_gid := nullif(g->>'id', '')::uuid;
    if v_gid is null or not exists (select 1 from public.appraisal_goals where id = v_gid and appraisal_id = p_id) then
      insert into public.appraisal_goals (appraisal_id, position, title) values (p_id, i, trim(g->>'title')) returning id into v_gid;
    else
      update public.appraisal_goals set position = i, title = trim(g->>'title') where id = v_gid;
    end if;
    if p_side = 'self' then
      update public.appraisal_goals set self_rating = nullif(g->>'rating', '')::smallint, self_comment = nullif(trim(coalesce(g->>'comment', '')), '') where id = v_gid;
    else
      update public.appraisal_goals set manager_rating = nullif(g->>'rating', '')::smallint, manager_comment = nullif(trim(coalesce(g->>'comment', '')), '') where id = v_gid;
    end if;
    v_keep := v_keep || v_gid;
  end loop;
  delete from public.appraisal_goals where appraisal_id = p_id and id <> all(v_keep);
end;
$$;
revoke execute on function public.appraisal_save_side(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- Self-appraisal ------------------------------------------------------------
create or replace function public.save_self_appraisal(p_id uuid, p_scores jsonb, p_goals jsonb, p_summary text, p_overall integer, p_submit boolean)
returns public.appraisals
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals; c public.appraisal_cycles; v_n integer;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found or a.user_id <> auth.uid() then raise exception 'Not permitted' using errcode = '42501'; end if;
  select * into c from public.appraisal_cycles where id = a.cycle_id;
  if c.status <> 'open' then raise exception 'This appraisal cycle is closed'; end if;
  if a.status <> 'self_review' then raise exception 'Your self-appraisal has already been submitted'; end if;

  perform public.appraisal_save_side(p_id, 'self', p_scores, p_goals);
  update public.appraisals set self_summary = nullif(trim(coalesce(p_summary, '')), ''), self_overall = p_overall, updated_at = now()
  where id = p_id returning * into a;

  if p_submit then
    select count(*) into v_n from public.appraisal_scores where appraisal_id = p_id and self_rating is not null;
    if v_n < jsonb_array_length(c.competencies) then raise exception 'Rate yourself on every competency before submitting'; end if;
    if p_overall is null then raise exception 'Give yourself an overall rating'; end if;
    update public.appraisals set status = case when manager_user_id is null then 'sign_off' else 'manager_review' end,
      self_submitted_at = now(), reminded_at = null, updated_at = now()
    where id = p_id returning * into a;
    if a.manager_user_id is not null then
      perform public.notify_user(a.organization_id, a.manager_user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.self_submitted', 'appraisal', a.id,
        coalesce((select full_name from public.profiles where id = a.user_id), 'A team member') || ' submitted their self-appraisal — please review it', 'info'::public.notification_priority);
      -- Other line managers are invited to add their view.
      perform public.notify_user(a.organization_id, lm.u, auth.uid(), 'hr'::public.notification_category, 'appraisal.input_invited', 'appraisal', a.id,
        'Add your input to ' || coalesce((select full_name from public.profiles where id = a.user_id), 'a team member') || '''s appraisal', 'info'::public.notification_priority)
      from public.line_manager_users(a.organization_id, a.user_id) lm(u) where lm.u <> a.manager_user_id;
    else
      perform public.notify_user(a.organization_id, m.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.to_sign_off', 'appraisal', a.id,
        'An appraisal is ready for sign-off (no line manager on record)', 'info'::public.notification_priority)
      from public.memberships m where m.organization_id = a.organization_id and m.status = 'active' and m.user_id <> a.user_id
        and public.member_has_permission(a.organization_id, m.user_id, 'appraisals.manage') and public.member_has_branch_access(a.organization_id, m.user_id, a.branch_id);
    end if;
  end if;
  return a;
end;
$$;
grant execute on function public.save_self_appraisal(uuid, jsonb, jsonb, text, integer, boolean) to authenticated;

-- Line manager review -------------------------------------------------------
create or replace function public.save_manager_review(p_id uuid, p_scores jsonb, p_goals jsonb, p_summary text, p_overall integer, p_recommendation text, p_submit boolean)
returns public.appraisals
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals; c public.appraisal_cycles; v_n integer;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found then raise exception 'Appraisal not found'; end if;
  if a.user_id = auth.uid() then raise exception 'You cannot review your own appraisal' using errcode = '42501'; end if;
  -- The reviewing (primary) line manager; HR can step in if that person has left.
  if a.manager_user_id is distinct from auth.uid()
     and not (public.is_appraisal_manager(a.organization_id, a.branch_id)
              and (a.manager_user_id is null or not exists (select 1 from public.memberships m where m.organization_id = a.organization_id and m.user_id = a.manager_user_id and m.status = 'active'))) then
    raise exception 'Only %''s line manager reviews this appraisal', coalesce((select full_name from public.profiles where id = a.user_id), 'this person') using errcode = '42501';
  end if;
  select * into c from public.appraisal_cycles where id = a.cycle_id;
  if c.status <> 'open' then raise exception 'This appraisal cycle is closed'; end if;
  if a.status <> 'manager_review' then raise exception 'This appraisal is not waiting for the manager review'; end if;

  perform public.appraisal_save_side(p_id, 'manager', p_scores, p_goals);
  update public.appraisals set manager_summary = nullif(trim(coalesce(p_summary, '')), ''), manager_overall = p_overall,
    manager_recommendation = nullif(trim(coalesce(p_recommendation, '')), ''), updated_at = now()
  where id = p_id returning * into a;

  if p_submit then
    select count(*) into v_n from public.appraisal_scores where appraisal_id = p_id and manager_rating is not null;
    if v_n < jsonb_array_length(c.competencies) then raise exception 'Rate every competency before submitting'; end if;
    if p_overall is null then raise exception 'Give an overall rating'; end if;
    update public.appraisals set status = 'sign_off', manager_submitted_at = now(), reminded_at = null, updated_at = now()
    where id = p_id returning * into a;
    perform public.notify_user(a.organization_id, m.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.to_sign_off', 'appraisal', a.id,
      coalesce((select full_name from public.profiles where id = a.user_id), 'An') || '''s appraisal is ready for sign-off', 'info'::public.notification_priority)
    from public.memberships m where m.organization_id = a.organization_id and m.status = 'active' and m.user_id not in (a.user_id, auth.uid())
      and public.member_has_permission(a.organization_id, m.user_id, 'appraisals.manage') and public.member_has_branch_access(a.organization_id, m.user_id, a.branch_id);
  end if;
  return a;
end;
$$;
grant execute on function public.save_manager_review(uuid, jsonb, jsonb, text, integer, text, boolean) to authenticated;

-- Other line managers' input ------------------------------------------------
create or replace function public.add_appraisal_input(p_id uuid, p_rating integer, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals;
begin
  select * into a from public.appraisals where id = p_id;
  if not found or not public.is_line_manager_of(a.organization_id, a.user_id, auth.uid()) or a.manager_user_id = auth.uid() then
    raise exception 'Only this person''s other line managers can add input here' using errcode = '42501';
  end if;
  if a.status not in ('self_review', 'manager_review', 'sign_off') then raise exception 'This appraisal has been signed off'; end if;
  if coalesce(trim(p_comment), '') = '' then raise exception 'Write your comments'; end if;
  insert into public.appraisal_inputs (appraisal_id, user_id, rating, comment) values (p_id, auth.uid(), p_rating, trim(p_comment))
  on conflict (appraisal_id, user_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;
grant execute on function public.add_appraisal_input(uuid, integer, text) to authenticated;

-- Sign-off (HR / Managing Partner) ------------------------------------------
create or replace function public.sign_off_appraisal(p_id uuid, p_final integer, p_recommendation text, p_comment text, p_return boolean default false)
returns public.appraisals
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found or not public.is_appraisal_manager(a.organization_id, a.branch_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if a.user_id = auth.uid() then raise exception 'You cannot sign off your own appraisal — another partner or HR must' using errcode = '42501'; end if;
  if a.status <> 'sign_off' then raise exception 'This appraisal is not waiting for sign-off'; end if;

  if p_return then
    if a.manager_user_id is null then raise exception 'There is no line manager to send it back to'; end if;
    if coalesce(trim(p_comment), '') = '' then raise exception 'Say what needs to change'; end if;
    update public.appraisals set status = 'manager_review', sign_off_comment = trim(p_comment), updated_at = now() where id = p_id returning * into a;
    perform public.notify_user(a.organization_id, a.manager_user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.returned', 'appraisal', a.id,
      'An appraisal was sent back to you: ' || trim(p_comment), 'warning'::public.notification_priority);
    return a;
  end if;

  if p_final is null or p_final not between 1 and 5 then raise exception 'Choose the final rating'; end if;
  update public.appraisals set status = 'acknowledge', final_rating = p_final, recommendation = nullif(trim(coalesce(p_recommendation, '')), ''),
    sign_off_comment = nullif(trim(coalesce(p_comment, '')), ''), signed_off_by = auth.uid(), signed_off_at = now(), updated_at = now()
  where id = p_id returning * into a;
  perform public.notify_user(a.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.signed_off', 'appraisal', a.id,
    'Your appraisal has been completed — please read and acknowledge it', 'info'::public.notification_priority);
  perform public.log_audit(a.organization_id, 'appraisal.signed_off', 'appraisal', a.id, 'Appraisal signed off', jsonb_build_object('final_rating', p_final));
  return a;
end;
$$;
grant execute on function public.sign_off_appraisal(uuid, integer, text, text, boolean) to authenticated;

-- Staff acknowledgement -----------------------------------------------------
create or replace function public.acknowledge_appraisal(p_id uuid, p_agrees boolean, p_comment text, p_with_signature boolean default false)
returns public.appraisals
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found or a.user_id <> auth.uid() then raise exception 'Not permitted' using errcode = '42501'; end if;
  if a.status <> 'acknowledge' then raise exception 'This appraisal is not waiting for your acknowledgement'; end if;
  if p_agrees is null then raise exception 'Say whether you agree with the appraisal'; end if;
  if not p_agrees and coalesce(trim(p_comment), '') = '' then raise exception 'Please explain what you disagree with'; end if;
  if p_with_signature and not exists (select 1 from public.user_signatures where user_id = auth.uid()) then
    raise exception 'Add your signature in Settings first';
  end if;
  update public.appraisals set status = 'completed', employee_agrees = p_agrees, employee_comment = nullif(trim(coalesce(p_comment, '')), ''),
    employee_signed = coalesce(p_with_signature, false), acknowledged_at = now(), updated_at = now()
  where id = p_id returning * into a;
  if a.signed_off_by is not null then
    perform public.notify_user(a.organization_id, a.signed_off_by, auth.uid(), 'hr'::public.notification_category, 'appraisal.acknowledged', 'appraisal', a.id,
      coalesce((select full_name from public.profiles where id = a.user_id), 'A staff member') || ' acknowledged their appraisal'
        || case when p_agrees then '' else ' but disagrees with it' end,
      case when p_agrees then 'info' else 'warning' end::public.notification_priority);
  end if;
  return a;
end;
$$;
grant execute on function public.acknowledge_appraisal(uuid, boolean, text, boolean) to authenticated;

-- Read one appraisal, masked for the viewer ---------------------------------
create or replace function public.get_appraisal(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.appraisals; c public.appraisal_cycles; e public.employees;
  v_role text; v_self boolean; v_mgr boolean; v_inputs boolean;
begin
  select * into a from public.appraisals where id = p_id;
  if not found then return null; end if;
  if a.user_id = auth.uid() then v_role := 'self';
  elsif a.manager_user_id = auth.uid() then v_role := 'manager';
  elsif public.is_appraisal_manager(a.organization_id, a.branch_id) then v_role := 'hr';
  elsif public.is_line_manager_of(a.organization_id, a.user_id, auth.uid()) then v_role := 'line_manager';
  else return null;
  end if;
  select * into c from public.appraisal_cycles where id = a.cycle_id;
  select * into e from public.employees where id = a.employee_id;

  -- Self answers: always to the person; to others once submitted.
  v_self := v_role = 'self' or a.self_submitted_at is not null;
  -- Manager answers: to the reviewer and HR as they're written (HR once submitted);
  -- to the person only after sign-off; to other line managers once submitted.
  v_mgr := case v_role
    when 'manager' then true
    when 'hr' then a.manager_submitted_at is not null or (a.manager_user_id is null)
    when 'line_manager' then a.manager_submitted_at is not null
    else a.status in ('acknowledge', 'completed') end;
  v_inputs := v_role in ('manager', 'hr');

  return jsonb_build_object(
    'viewer_role', v_role,
    'appraisal', jsonb_build_object(
      'id', a.id, 'organization_id', a.organization_id, 'cycle_id', a.cycle_id, 'employee_id', a.employee_id, 'user_id', a.user_id,
      'branch_id', a.branch_id, 'manager_user_id', a.manager_user_id, 'status', a.status,
      'employee_name', trim(e.first_name || ' ' || coalesce(e.last_name, '')), 'employee_number', e.employee_number,
      'job_title', (select name from public.job_titles where id = e.job_title_id),
      'department', (select name from public.departments where id = e.department_id),
      'manager_name', (select full_name from public.profiles where id = a.manager_user_id),
      'self_summary', case when v_self then a.self_summary end, 'self_overall', case when v_self then a.self_overall end,
      'self_submitted_at', a.self_submitted_at,
      'manager_summary', case when v_mgr then a.manager_summary end, 'manager_overall', case when v_mgr then a.manager_overall end,
      'manager_recommendation', case when v_mgr then a.manager_recommendation end, 'manager_submitted_at', a.manager_submitted_at,
      'final_rating', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.final_rating end,
      'recommendation', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.recommendation end,
      'sign_off_comment', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.sign_off_comment end,
      'signed_off_by', a.signed_off_by, 'signed_off_by_name', (select full_name from public.profiles where id = a.signed_off_by), 'signed_off_at', a.signed_off_at,
      'employee_agrees', a.employee_agrees, 'employee_comment', a.employee_comment, 'employee_signed', a.employee_signed, 'acknowledged_at', a.acknowledged_at
    ),
    'cycle', jsonb_build_object('id', c.id, 'name', c.name, 'period_start', c.period_start, 'period_end', c.period_end,
      'self_due', c.self_due, 'manager_due', c.manager_due, 'status', c.status, 'competencies', c.competencies),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
        'competency', s.competency,
        'self_rating', case when v_self then s.self_rating end, 'self_comment', case when v_self then s.self_comment end,
        'manager_rating', case when v_mgr then s.manager_rating end, 'manager_comment', case when v_mgr then s.manager_comment end) order by s.competency)
      from public.appraisal_scores s where s.appraisal_id = a.id), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title,
        'self_rating', case when v_self then g.self_rating end, 'self_comment', case when v_self then g.self_comment end,
        'manager_rating', case when v_mgr then g.manager_rating end, 'manager_comment', case when v_mgr then g.manager_comment end) order by g.position)
      from public.appraisal_goals g where g.appraisal_id = a.id and (v_self or v_role = 'manager')), '[]'::jsonb),
    'inputs', case when v_inputs then coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'rating', i.rating, 'comment', i.comment, 'at', i.updated_at))
      from public.appraisal_inputs i left join public.profiles p on p.id = i.user_id where i.appraisal_id = a.id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('name', 'You', 'rating', i.rating, 'comment', i.comment, 'at', i.updated_at))
      from public.appraisal_inputs i where i.appraisal_id = a.id and i.user_id = auth.uid()), '[]'::jsonb) end
  );
end;
$$;
grant execute on function public.get_appraisal(uuid) to authenticated;

-- Cycle progress for HR: names, stages and final ratings (never the detail).
create or replace function public.appraisal_cycle_progress(p_cycle uuid)
returns table (id uuid, employee_id uuid, user_id uuid, employee_name text, branch_id uuid, department text, manager_name text,
               status text, final_rating smallint, employee_agrees boolean, self_submitted_at timestamptz, manager_submitted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare c public.appraisal_cycles;
begin
  select * into c from public.appraisal_cycles where appraisal_cycles.id = p_cycle;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  return query
  select a.id, a.employee_id, a.user_id, trim(e.first_name || ' ' || coalesce(e.last_name, '')), a.branch_id,
    (select d.name from public.departments d where d.id = e.department_id), (select p.full_name from public.profiles p where p.id = a.manager_user_id),
    a.status, a.final_rating, a.employee_agrees, a.self_submitted_at, a.manager_submitted_at
  from public.appraisals a join public.employees e on e.id = a.employee_id
  where a.cycle_id = p_cycle and public.user_has_branch_access(a.organization_id, a.branch_id)
  order by 4;
end;
$$;
grant execute on function public.appraisal_cycle_progress(uuid) to authenticated;

-- Remind everyone who's holding an appraisal up (HR button + daily after due dates).
create or replace function public.remind_appraisals(p_cycle uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c public.appraisal_cycles; v_n integer := 0; v_k integer;
begin
  select * into c from public.appraisal_cycles where id = p_cycle;
  if not found then raise exception 'Cycle not found'; end if;
  if auth.uid() is not null and not public.has_permission(c.organization_id, 'appraisals.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if c.status <> 'open' then return 0; end if;
  perform public.notify_user(c.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.reminder', 'appraisal', a.id,
    'Reminder: please complete your ' || c.name || ' self-appraisal', 'reminder'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.status = 'self_review';
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  perform public.notify_user(c.organization_id, a.manager_user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.reminder', 'appraisal', a.id,
    'Reminder: ' || coalesce((select full_name from public.profiles where id = a.user_id), 'a team member') || '''s appraisal is waiting for your review', 'reminder'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.status = 'manager_review' and a.manager_user_id is not null;
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  perform public.notify_user(c.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.reminder', 'appraisal', a.id,
    'Reminder: please read and acknowledge your appraisal', 'reminder'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.status = 'acknowledge';
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  update public.appraisals set reminded_at = now() where cycle_id = c.id and status in ('self_review', 'manager_review', 'acknowledge');
  return v_n;
end;
$$;
grant execute on function public.remind_appraisals(uuid) to authenticated;

-- Daily 08:00: after a due date passes, remind once every 3 days.
create or replace function public.run_appraisal_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c record; v_n integer := 0;
begin
  for c in
    select distinct ac.id from public.appraisal_cycles ac join public.appraisals a on a.cycle_id = ac.id
    where ac.status = 'open'
      and ((a.status = 'self_review' and ac.self_due < current_date) or (a.status = 'manager_review' and ac.manager_due < current_date))
      and (a.reminded_at is null or a.reminded_at < now() - interval '3 days')
  loop
    v_n := v_n + public.remind_appraisals(c.id);
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.run_appraisal_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'appraisal-reminders') then
    perform cron.unschedule('appraisal-reminders');
  end if;
  perform cron.schedule('appraisal-reminders', '0 8 * * *', 'select public.run_appraisal_reminders()');
end $$;
