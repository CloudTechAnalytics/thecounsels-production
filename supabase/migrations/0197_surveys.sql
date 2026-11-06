-- ============================================================================
-- Migration 0197 — Surveys & questionnaires.
--
-- surveys            title, intro, anonymous or named, audience (same choices
--                    as circulars), closing date; draft → open → closed.
-- survey_questions   single choice, multiple choice, rating 1–5, yes/no, text.
-- survey_recipients  who was asked and whether they've answered (never what).
-- survey_responses   one per submission; user_id is NULL when anonymous.
-- survey_answers     the answers.
--
-- Survey managers = 'surveys.manage' (Managing Partner, HR roles). Drafts
-- are saved whole through save_survey (questions replaced), sent with
-- send_survey, answered with submit_survey. Results come from
-- survey_results: for anonymous surveys nothing is shown until 3 people
-- have answered, text answers come back shuffled, and managers can never
-- read anonymous response rows directly.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('surveys.manage', 'surveys', 'manage', 'Create and send staff surveys and see their results')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'surveys.manage'
where r.key in ('managing_partner', 'hr_manager', 'hr_administrator', 'hr')
on conflict do nothing;

create table if not exists public.surveys (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  title                  text not null check (length(trim(title)) between 1 and 200),
  description            text,
  anonymous              boolean not null default true,
  status                 text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  audience_type          text not null default 'organization' check (audience_type in ('organization', 'department', 'branch', 'role', 'employees')),
  audience_department_id uuid references public.departments(id) on delete set null,
  audience_branch_id     uuid references public.branches(id) on delete set null,
  audience_role_key      public.role_key,
  audience_user_ids      uuid[] not null default '{}',
  closes_on              date,
  recipient_count        integer not null default 0,
  response_count         integer not null default 0,
  sent_at                timestamptz,
  closed_at              timestamptz,
  created_by             uuid default auth.uid() references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_surveys_org on public.surveys (organization_id, status, created_at desc);

create table if not exists public.survey_questions (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  position   integer not null,
  kind       text not null check (kind in ('single', 'multi', 'rating', 'yesno', 'text')),
  prompt     text not null check (length(trim(prompt)) between 1 and 500),
  options    text[] not null default '{}',
  required   boolean not null default true
);
create index if not exists idx_survey_questions_survey on public.survey_questions (survey_id, position);

create table if not exists public.survey_recipients (
  survey_id       uuid not null references public.surveys(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  responded_at    timestamptz,
  reminded_at     timestamptz,
  primary key (survey_id, user_id)
);
create index if not exists idx_survey_recipients_user on public.survey_recipients (user_id, responded_at);

create table if not exists public.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_survey_responses_survey on public.survey_responses (survey_id);

create table if not exists public.survey_answers (
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  choices     text[],
  rating      smallint check (rating between 1 and 5),
  text_value  text,
  primary key (response_id, question_id)
);

-- RLS -----------------------------------------------------------------------
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_recipients enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

create or replace function public.can_view_survey(p_survey uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_survey and (
      public.has_permission(s.organization_id, 'surveys.manage')
      or (s.status <> 'draft' and exists (select 1 from public.survey_recipients r where r.survey_id = s.id and r.user_id = auth.uid()))
    )
  );
$$;
grant execute on function public.can_view_survey(uuid) to authenticated;

drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys for select using (public.can_view_survey(id));
-- Only drafts may be deleted, and only by a survey manager; all other writes go through the RPCs.
drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys for delete using (status = 'draft' and public.has_permission(organization_id, 'surveys.manage'));

drop policy if exists survey_questions_select on public.survey_questions;
create policy survey_questions_select on public.survey_questions for select using (public.can_view_survey(survey_id));

drop policy if exists survey_recipients_select on public.survey_recipients;
create policy survey_recipients_select on public.survey_recipients
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'surveys.manage'));

-- Named surveys: managers may read responses and answers directly.
-- Anonymous surveys: nobody reads rows; only survey_results' aggregates.
drop policy if exists survey_responses_select on public.survey_responses;
create policy survey_responses_select on public.survey_responses
  for select using (exists (select 1 from public.surveys s where s.id = survey_id and not s.anonymous
                            and public.has_permission(s.organization_id, 'surveys.manage')));
drop policy if exists survey_answers_select on public.survey_answers;
create policy survey_answers_select on public.survey_answers
  for select using (exists (select 1 from public.survey_responses r join public.surveys s on s.id = r.survey_id
                            where r.id = response_id and not s.anonymous and public.has_permission(s.organization_id, 'surveys.manage')));

grant select, delete on public.surveys to authenticated;
grant select on public.survey_questions, public.survey_recipients, public.survey_responses, public.survey_answers to authenticated;

-- Save a draft (create or update) with its questions ------------------------
-- p_questions: [{kind, prompt, options: [..], required}]
create or replace function public.save_survey(
  p_org uuid, p_id uuid, p_title text, p_description text, p_anonymous boolean, p_closes_on date,
  p_audience_type text, p_department_id uuid, p_branch_id uuid, p_role_key public.role_key, p_user_ids uuid[],
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := p_id; q jsonb; i integer := 0; v_opts text[];
begin
  if not public.has_permission(p_org, 'surveys.manage') or not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the survey a title'; end if;
  if p_audience_type not in ('organization', 'department', 'branch', 'role', 'employees') then
    raise exception 'Invalid audience';
  end if;
  if p_closes_on is not null and p_closes_on < current_date then raise exception 'The closing date has passed'; end if;

  if v_id is null then
    insert into public.surveys (organization_id, title, description, anonymous, closes_on, audience_type, audience_department_id,
      audience_branch_id, audience_role_key, audience_user_ids)
    values (p_org, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_anonymous, true), p_closes_on, p_audience_type,
      p_department_id, p_branch_id, p_role_key, coalesce(p_user_ids, '{}'))
    returning id into v_id;
  else
    update public.surveys set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''),
      anonymous = coalesce(p_anonymous, true), closes_on = p_closes_on, audience_type = p_audience_type,
      audience_department_id = p_department_id, audience_branch_id = p_branch_id, audience_role_key = p_role_key,
      audience_user_ids = coalesce(p_user_ids, '{}'), updated_at = now()
    where id = v_id and organization_id = p_org and status = 'draft';
    if not found then raise exception 'Only drafts can be edited'; end if;
    delete from public.survey_questions where survey_id = v_id;
  end if;

  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    i := i + 1;
    select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), '{}') into v_opts from jsonb_array_elements_text(coalesce(q->'options', '[]'::jsonb)) x;
    if q->>'kind' in ('single', 'multi') and cardinality(v_opts) < 2 then
      raise exception 'Question % needs at least two options', i;
    end if;
    insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
    values (v_id, i, q->>'kind', trim(q->>'prompt'), case when q->>'kind' in ('single', 'multi') then v_opts else '{}' end,
      coalesce((q->>'required')::boolean, true));
  end loop;
  return v_id;
end;
$$;
grant execute on function public.save_survey(uuid, uuid, text, text, boolean, date, text, uuid, uuid, public.role_key, uuid[], jsonb) to authenticated;

-- Send it -------------------------------------------------------------------
create or replace function public.send_survey(p_id uuid)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare s public.surveys; v_n integer;
begin
  select * into s from public.surveys where id = p_id for update;
  if not found or not public.has_permission(s.organization_id, 'surveys.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if s.status <> 'draft' then raise exception 'This survey has already been sent'; end if;
  if not exists (select 1 from public.survey_questions where survey_id = p_id) then
    raise exception 'Add at least one question';
  end if;
  if s.closes_on is not null and s.closes_on < current_date then raise exception 'The closing date has passed'; end if;

  insert into public.survey_recipients (survey_id, organization_id, user_id)
  select s.id, s.organization_id, m.user_id
  from public.memberships m
  join public.roles ro on ro.id = m.role_id
  where m.organization_id = s.organization_id and m.status = 'active'
    and (
      s.audience_type = 'organization'
      or (s.audience_type = 'employees' and m.user_id = any(s.audience_user_ids))
      or (s.audience_type = 'role' and ro.key = s.audience_role_key)
      or (s.audience_type = 'department' and (
            exists (select 1 from public.employees e where e.organization_id = s.organization_id and e.user_id = m.user_id and e.department_id = s.audience_department_id)
         or exists (select 1 from public.staff_profiles sp where sp.organization_id = s.organization_id and sp.user_id = m.user_id and sp.department_id = s.audience_department_id)))
      or (s.audience_type = 'branch' and (
            exists (select 1 from public.member_branches mb where mb.membership_id = m.id and mb.branch_id = s.audience_branch_id)
         or exists (select 1 from public.employees e where e.organization_id = s.organization_id and e.user_id = m.user_id and e.branch_id = s.audience_branch_id)))
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nobody matches that audience — choose who should answer it'; end if;

  update public.surveys set status = 'open', sent_at = now(), recipient_count = v_n, updated_at = now()
  where id = s.id returning * into s;

  perform public.notify_user(s.organization_id, r.user_id, auth.uid(), 'hr'::public.notification_category, 'survey.sent', 'survey', s.id,
    'Survey: ' || s.title || case when s.anonymous then ' (anonymous)' else '' end, 'info'::public.notification_priority)
  from public.survey_recipients r where r.survey_id = s.id and r.user_id <> auth.uid();
  perform public.log_audit(s.organization_id, 'survey.sent', 'survey', s.id, 'Sent survey: ' || s.title, jsonb_build_object('recipients', v_n));
  return s;
end;
$$;
grant execute on function public.send_survey(uuid) to authenticated;

-- Answer it -----------------------------------------------------------------
-- p_answers: { "<question id>": "choice" | ["a","b"] | 4 | "free text" }
create or replace function public.submit_survey(p_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.surveys; q public.survey_questions; v jsonb; v_resp uuid; v_choices text[]; v_rating integer; v_text text;
begin
  select * into s from public.surveys where id = p_id;
  if not found then raise exception 'Survey not found'; end if;
  if not exists (select 1 from public.survey_recipients where survey_id = p_id and user_id = auth.uid()) then
    raise exception 'This survey was not sent to you' using errcode = '42501';
  end if;
  if s.status <> 'open' or (s.closes_on is not null and s.closes_on < current_date) then
    raise exception 'This survey is closed';
  end if;
  -- Lock the recipient row so a double-click can't submit twice.
  perform 1 from public.survey_recipients where survey_id = p_id and user_id = auth.uid() and responded_at is null for update;
  if not found then raise exception 'You have already answered this survey'; end if;

  insert into public.survey_responses (survey_id, user_id) values (p_id, case when s.anonymous then null else auth.uid() end)
  returning id into v_resp;

  for q in select * from public.survey_questions where survey_id = p_id order by position loop
    v := p_answers -> q.id::text;
    v_choices := null; v_rating := null; v_text := null;
    if v is not null and v <> 'null'::jsonb then
      if q.kind = 'multi' then
        select coalesce(array_agg(x), '{}') into v_choices from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else jsonb_build_array(v) end) x;
        if exists (select 1 from unnest(v_choices) c where c <> all(q.options)) then raise exception 'Invalid answer to question %', q.position; end if;
        if cardinality(v_choices) = 0 then v_choices := null; end if;
      elsif q.kind in ('single', 'yesno') then
        v_choices := array[v #>> '{}'];
        if (q.kind = 'single' and v_choices[1] <> all(q.options)) or (q.kind = 'yesno' and v_choices[1] not in ('Yes', 'No')) then
          raise exception 'Invalid answer to question %', q.position;
        end if;
      elsif q.kind = 'rating' then
        v_rating := (v #>> '{}')::integer;
        if v_rating not between 1 and 5 then raise exception 'Invalid rating for question %', q.position; end if;
      else
        v_text := nullif(trim(left(v #>> '{}', 4000)), '');
      end if;
    end if;
    if q.required and v_choices is null and v_rating is null and v_text is null then
      raise exception 'Please answer question %', q.position;
    end if;
    if v_choices is not null or v_rating is not null or v_text is not null then
      insert into public.survey_answers (response_id, question_id, choices, rating, text_value) values (v_resp, q.id, v_choices, v_rating, v_text);
    end if;
  end loop;

  -- For anonymous surveys don't record the exact time (it could be matched to the response).
  update public.survey_recipients set responded_at = case when s.anonymous then date_trunc('day', now()) else now() end
  where survey_id = p_id and user_id = auth.uid();
  update public.surveys set response_count = response_count + 1 where id = p_id;
  update public.notifications set is_read = true
  where user_id = auth.uid() and entity_type = 'survey' and entity_id = p_id and not is_read;
end;
$$;
grant execute on function public.submit_survey(uuid, jsonb) to authenticated;

-- Remind / close ------------------------------------------------------------
create or replace function public.remind_survey(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare s public.surveys; v_n integer;
begin
  select * into s from public.surveys where id = p_id;
  if not found or not public.has_permission(s.organization_id, 'surveys.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if s.status <> 'open' then raise exception 'This survey is not open'; end if;
  perform public.notify_user(s.organization_id, r.user_id, auth.uid(), 'hr'::public.notification_category, 'survey.reminder', 'survey', s.id,
    'Reminder — please answer: ' || s.title, 'reminder'::public.notification_priority)
  from public.survey_recipients r where r.survey_id = p_id and r.responded_at is null;
  get diagnostics v_n = row_count;
  update public.survey_recipients set reminded_at = now() where survey_id = p_id and responded_at is null;
  return v_n;
end;
$$;
grant execute on function public.remind_survey(uuid) to authenticated;

create or replace function public.close_survey(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.surveys;
begin
  select * into s from public.surveys where id = p_id;
  if not found or not public.has_permission(s.organization_id, 'surveys.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  update public.surveys set status = 'closed', closed_at = now(), updated_at = now() where id = p_id and status = 'open';
  update public.notifications set is_read = true where entity_type = 'survey' and entity_id = p_id and not is_read;
end;
$$;
grant execute on function public.close_survey(uuid) to authenticated;

-- Results -------------------------------------------------------------------
create or replace function public.survey_results(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare s public.surveys; v jsonb;
begin
  select * into s from public.surveys where id = p_id;
  if not found or not public.has_permission(s.organization_id, 'surveys.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if s.anonymous and s.response_count < 3 then
    return jsonb_build_object('hidden', true, 'responses', s.response_count, 'recipients', s.recipient_count);
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', q.id, 'position', q.position, 'kind', q.kind, 'prompt', q.prompt, 'options', to_jsonb(q.options),
    'answered', (select count(*) from public.survey_answers a join public.survey_responses r on r.id = a.response_id where a.question_id = q.id),
    'counts', (select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (
                 select c, count(*) n from public.survey_answers a, unnest(a.choices) c where a.question_id = q.id group by c) t),
    'ratings', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb) from (
                 select rating, count(*) n from public.survey_answers a where a.question_id = q.id and a.rating is not null group by rating) t),
    'average', (select round(avg(rating)::numeric, 2) from public.survey_answers a where a.question_id = q.id and a.rating is not null),
    'texts', (select coalesce(jsonb_agg(jsonb_build_object('text', t.text_value, 'name', t.name)), '[]'::jsonb) from (
                 select a.text_value, case when s.anonymous then null else p.full_name end as name
                 from public.survey_answers a join public.survey_responses r on r.id = a.response_id
                 left join public.profiles p on p.id = r.user_id
                 where a.question_id = q.id and a.text_value is not null
                 order by case when s.anonymous then random() else extract(epoch from r.submitted_at) end) t)
  ) order by q.position) into v
  from public.survey_questions q where q.survey_id = p_id;

  return jsonb_build_object('hidden', false, 'responses', s.response_count, 'recipients', s.recipient_count, 'questions', coalesce(v, '[]'::jsonb));
end;
$$;
grant execute on function public.survey_results(uuid) to authenticated;

-- Close surveys past their closing date (daily, 00:30).
create or replace function public.run_survey_closures()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.surveys set status = 'closed', closed_at = now(), updated_at = now()
  where status = 'open' and closes_on is not null and closes_on < current_date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.run_survey_closures() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'survey-closures') then
    perform cron.unschedule('survey-closures');
  end if;
  perform cron.schedule('survey-closures', '30 0 * * *', 'select public.run_survey_closures()');
end $$;
