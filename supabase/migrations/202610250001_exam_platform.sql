-- Glorious High-Tech School examination schema. Apply to a NEW Supabase project only
-- after reviewing the target schema. The migration deliberately does not drop objects.
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.attempt_status as enum ('in_progress', 'submitted', 'locked', 'invalid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.exam_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into public.exam_groups(slug,name) values
 ('class-8','Class 8'), ('class-9','Class 9'), ('class-10-boys','Class 10 Boys'),
 ('class-10-girls','Class 10 Girls'), ('class-11','Class 11'), ('class-12','Class 12')
on conflict (slug) do nothing;
create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  roll_number text not null,
  student_code text not null unique,
  exam_group_id uuid not null references public.exam_groups(id),
  section text,
  created_at timestamptz not null default now(),
  unique (exam_group_id, roll_number)
);
create table public.teacher_groups (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  exam_group_id uuid not null references public.exam_groups(id) on delete cascade,
  primary key (teacher_id, exam_group_id)
);
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  exam_group_id uuid not null references public.exam_groups(id),
  title text not null,
  subject text not null,
  academic_session text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  max_marks numeric(8,2) not null check (max_marks > 0),
  passing_marks numeric(8,2) not null check (passing_marks >= 0 and passing_marks <= max_marks),
  negative_mark numeric(8,2) not null default 0 check (negative_mark >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  published boolean not null default false,
  results_published boolean not null default false,
  randomize_questions boolean not null default false,
  randomize_options boolean not null default false,
  warning_policy text not null default 'submit' check (warning_policy in ('submit','lock')),
  ranking_enabled boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index exams_group_schedule_idx on public.exams(exam_group_id, starts_at, ends_at);
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  body text not null,
  image_url text,
  marks numeric(8,2) not null default 1 check (marks > 0),
  position integer not null,
  created_at timestamptz not null default now(),
  unique(exam_id, position)
);
create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_label char(1) not null check (option_label in ('A','B','C','D')),
  body text not null,
  is_correct boolean not null default false,
  unique(question_id, option_label),
  unique(question_id, id)
);
create unique index one_correct_option_per_question on public.question_options(question_id) where is_correct;
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id),
  student_id uuid not null references public.students(id),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  session_token uuid not null default gen_random_uuid(),
  warning_count integer not null default 0 check (warning_count between 0 and 3),
  created_at timestamptz not null default now(),
  unique(exam_id, student_id),
  unique(id, student_id)
);
create index attempts_exam_status_idx on public.exam_attempts(exam_id, status);
create table public.student_answers (
  attempt_id uuid not null,
  student_id uuid not null,
  question_id uuid not null references public.questions(id),
  option_id uuid,
  marked_for_review boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(attempt_id, question_id),
  foreign key(attempt_id, student_id) references public.exam_attempts(id, student_id) on delete cascade,
  foreign key(question_id, option_id) references public.question_options(question_id, id)
);
create table public.exam_warnings (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  student_id uuid not null references public.students(id),
  event_type text not null check (event_type in ('visibility_hidden','window_blur','fullscreen_exit')),
  occurred_at timestamptz not null default now(),
  count_after integer not null check (count_after between 1 and 3),
  unique(attempt_id, count_after)
);
create table public.results (
  attempt_id uuid primary key references public.exam_attempts(id),
  exam_id uuid not null references public.exams(id),
  student_id uuid not null references public.students(id),
  correct_count integer not null,
  incorrect_count integer not null,
  unanswered_count integer not null,
  marks_obtained numeric(8,2) not null,
  max_marks numeric(8,2) not null,
  percentage numeric(6,2) not null,
  passed boolean not null,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(exam_id, student_id)
);
create index results_ranking_idx on public.results(exam_id, marks_obtained desc, submitted_at asc);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  object_type text not null,
  object_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The shared-paper requirement is enforced by assigning the same exam_id to both
-- class-10 group records via a shared-paper relation. Student attempts remain separate.
create table public.exam_group_assignments (
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_group_id uuid not null references public.exam_groups(id),
  primary key(exam_id, exam_group_id)
);
create index group_assignments_group_idx on public.exam_group_assignments(exam_group_id);

create or replace function public.is_school_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;
create or replace function public.can_teach_group(group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_school_admin() or exists (
    select 1 from public.teacher_groups tg where tg.teacher_id = (select auth.uid()) and tg.exam_group_id = group_id
  )
$$;

alter table public.profiles enable row level security;
alter table public.exam_groups enable row level security;
alter table public.students enable row level security;
alter table public.teacher_groups enable row level security;
alter table public.exams enable row level security;
alter table public.exam_group_assignments enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.student_answers enable row level security;
alter table public.exam_warnings enable row level security;
alter table public.results enable row level security;
alter table public.audit_logs enable row level security;

create policy profile_self_read on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_school_admin());
create policy profile_admin_manage on public.profiles for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy group_authenticated_read on public.exam_groups for select to authenticated using (true);
create policy student_self_read on public.students for select to authenticated using (profile_id = (select auth.uid()) or public.can_teach_group(exam_group_id));
create policy student_admin_manage on public.students for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy teacher_group_scope on public.teacher_groups for select to authenticated using (teacher_id = (select auth.uid()) or public.is_school_admin());
create policy exams_teacher_manage on public.exams for all to authenticated using (
  public.can_teach_group(exams.exam_group_id) or exists(select 1 from public.exam_group_assignments ega where ega.exam_id=exams.id and public.can_teach_group(ega.exam_group_id))
) with check (
  public.can_teach_group(exams.exam_group_id) or exists(select 1 from public.exam_group_assignments ega where ega.exam_id=exams.id and public.can_teach_group(ega.exam_group_id))
);
create policy exams_student_read_published on public.exams for select to authenticated using (
  published and exists(select 1 from public.exam_group_assignments ega join public.students s on s.exam_group_id=ega.exam_group_id where ega.exam_id=exams.id and s.profile_id=(select auth.uid()))
);
create policy assignments_read_scope on public.exam_group_assignments for select to authenticated using (
  public.can_teach_group(exam_group_id) or exists(select 1 from public.students s where s.profile_id = (select auth.uid()) and s.exam_group_id = exam_group_assignments.exam_group_id)
);
create policy questions_teacher_manage on public.questions for all to authenticated using (
  exists(select 1 from public.exam_group_assignments ega where ega.exam_id=questions.exam_id and public.can_teach_group(ega.exam_group_id))
) with check (exists(select 1 from public.exam_group_assignments ega where ega.exam_id=questions.exam_id and public.can_teach_group(ega.exam_group_id)));
create policy questions_student_read on public.questions for select to authenticated using (
  exists(select 1 from public.exams e join public.exam_group_assignments ega on ega.exam_id=e.id join public.students s on s.exam_group_id=ega.exam_group_id where e.id=questions.exam_id and e.published and s.profile_id=(select auth.uid()))
);
-- Students receive question choices only from the start_attempt RPC; the key is never selectable.
create policy options_teacher_manage on public.question_options for all to authenticated using (
  exists(select 1 from public.questions q join public.exam_group_assignments ega on ega.exam_id=q.exam_id where q.id=question_options.question_id and public.can_teach_group(ega.exam_group_id))
) with check (exists(select 1 from public.questions q join public.exam_group_assignments ega on ega.exam_id=q.exam_id where q.id=question_options.question_id and public.can_teach_group(ega.exam_group_id)));
create policy attempts_student_read on public.exam_attempts for select to authenticated using (
  exists(select 1 from public.students s where s.id = exam_attempts.student_id and s.profile_id = (select auth.uid())) or public.can_teach_group((select e.exam_group_id from public.exams e where e.id = exam_attempts.exam_id))
);
create policy answers_student_read on public.student_answers for select to authenticated using (
  exists(select 1 from public.students s where s.id = student_answers.student_id and s.profile_id = (select auth.uid())) or
  exists(select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = student_answers.attempt_id and public.can_teach_group(e.exam_group_id))
);
create policy warnings_teacher_read on public.exam_warnings for select to authenticated using (
  exists(select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = exam_warnings.attempt_id and public.can_teach_group(e.exam_group_id))
);
create policy results_self_or_teacher_read on public.results for select to authenticated using (
  (exists(select 1 from public.students s where s.id = results.student_id and s.profile_id = (select auth.uid())) and exists(select 1 from public.exams e where e.id = results.exam_id and e.results_published)) or
  public.can_teach_group((select e.exam_group_id from public.exams e where e.id = results.exam_id))
);
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_school_admin());

create or replace function public.get_my_exams() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_student public.students%rowtype; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_student from public.students where profile_id=v_uid;
  if not found then raise exception 'Student profile not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'title',e.title,'subject',e.subject,'academic_session',e.academic_session,
    'duration_seconds',e.duration_seconds,'results_published',e.results_published,
    'status',case when a.status='submitted' then 'submitted' when a.status='locked' then 'locked' when a.status='in_progress' then 'in_progress'
      when not e.published or (e.starts_at is not null and now()<e.starts_at) or (e.ends_at is not null and now()>e.ends_at) then 'closed' else 'active' end
  ) order by e.starts_at nulls last), '[]'::jsonb) into v_result
  from public.exams e join public.exam_group_assignments ega on ega.exam_id=e.id and ega.exam_group_id=v_student.exam_group_id
  left join public.exam_attempts a on a.exam_id=e.id and a.student_id=v_student.id;
  return v_result;
end $$;

create or replace function public.get_teacher_results() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  with scoped as (
    select r.*,e.title as exam_title,e.subject,e.academic_session,ega.exam_group_id,eg.name as group_name,
      p.full_name,s.roll_number,s.student_code,s.section,
      row_number() over(partition by r.exam_id,ega.exam_group_id order by r.marks_obtained desc,r.submitted_at asc,s.roll_number asc) as class_rank
    from public.results r join public.exams e on e.id=r.exam_id
    join public.exam_group_assignments ega on ega.exam_id=e.id
    join public.exam_groups eg on eg.id=ega.exam_group_id
    join public.students s on s.id=r.student_id and s.exam_group_id=ega.exam_group_id
    join public.profiles p on p.id=s.profile_id
    where public.can_teach_group(ega.exam_group_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'exam_id',exam_id,'attempt_id',attempt_id,'exam_title',exam_title,'subject',subject,'academic_session',academic_session,
    'exam_group_id',exam_group_id,'group_name',group_name,'full_name',full_name,'roll_number',roll_number,'student_code',student_code,
    'section',section,'correct_count',correct_count,'incorrect_count',incorrect_count,'unanswered_count',unanswered_count,
    'marks_obtained',marks_obtained,'max_marks',max_marks,'percentage',percentage,'passed',passed,'submitted_at',submitted_at,'rank',class_rank
  ) order by group_name,exam_title,class_rank),'[]'::jsonb) into v_result from scoped;
  return v_result;
end $$;

-- A single question-paper record can be associated with both class-10 cohorts, while
-- the students table and unique (exam_id, student_id) attempt key keep cohorts separate.
create or replace function public.start_exam(p_exam_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_student public.students%rowtype; v_exam public.exams%rowtype; v_attempt public.exam_attempts%rowtype; v_payload jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_student from public.students where profile_id = v_uid;
  if not found then raise exception 'Student profile not found'; end if;
  select e.* into v_exam from public.exams e join public.exam_group_assignments a on a.exam_id=e.id and a.exam_group_id=v_student.exam_group_id where e.id=p_exam_id and e.published;
  if not found then raise exception 'No published exam is assigned to this student'; end if;
  if (v_exam.starts_at is not null and now() < v_exam.starts_at) or (v_exam.ends_at is not null and now() > v_exam.ends_at) then raise exception 'Exam is outside its scheduled availability'; end if;
  if not exists(select 1 from public.questions q where q.exam_id=p_exam_id) then raise exception 'This examination has no questions'; end if;
  if exists(select 1 from public.questions q left join public.question_options o on o.question_id=q.id where q.exam_id=p_exam_id group by q.id having count(o.id) <> 4 or count(o.id) filter(where o.is_correct) <> 1) then
    raise exception 'This examination paper is incomplete or has an invalid answer key';
  end if;
  if (select coalesce(sum(q.marks),0) from public.questions q where q.exam_id=p_exam_id) <> v_exam.max_marks then
    raise exception 'Question marks do not match the configured maximum';
  end if;
  select * into v_attempt from public.exam_attempts where exam_id=p_exam_id and student_id=v_student.id;
  if not found then
    insert into public.exam_attempts(exam_id,student_id,expires_at) values(p_exam_id,v_student.id,least(now()+make_interval(secs=>v_exam.duration_seconds),coalesce(v_exam.ends_at,'infinity'::timestamptz))) returning * into v_attempt;
  elsif v_attempt.status <> 'in_progress' then raise exception 'This attempt has already been submitted or locked';
  end if;
  if now() >= v_attempt.expires_at then raise exception 'Exam time has expired'; end if;
    select jsonb_agg(jsonb_build_object('id',q.id,'body',q.body,'image_url',q.image_url,'marks',q.marks,'position',q.position,'options',(
    select jsonb_agg(jsonb_build_object('id',o.id,'label',o.option_label,'body',o.body) order by case when v_exam.randomize_options then random() else ascii(o.option_label) end) from public.question_options o where o.question_id=q.id
  ),'answer',sa.option_id,'marked_for_review',coalesce(sa.marked_for_review,false)) order by case when v_exam.randomize_questions then random() else q.position end)
  into v_payload from public.questions q left join public.student_answers sa on sa.question_id=q.id and sa.attempt_id=v_attempt.id where q.exam_id=p_exam_id;
  return jsonb_build_object('attempt_id',v_attempt.id,'session_token',v_attempt.session_token,'expires_at',v_attempt.expires_at,'warning_count',v_attempt.warning_count,'duration_seconds',v_exam.duration_seconds,'title',v_exam.title,'subject',v_exam.subject,'questions',coalesce(v_payload,'[]'::jsonb));
end $$;

create or replace function public.save_exam_answer(p_attempt_id uuid,p_session_token uuid,p_question_id uuid,p_option_id uuid,p_marked boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_student_id uuid; v_exam_id uuid;
begin
  select s.id,a.exam_id into v_student_id,v_exam_id from public.exam_attempts a join public.students s on s.id=a.student_id where a.id=p_attempt_id and s.profile_id=v_uid and a.session_token=p_session_token and a.status='in_progress' and now()<a.expires_at for update of a;
  if not found then raise exception 'Active exam session not found or expired'; end if;
  if not exists(select 1 from public.questions q where q.id=p_question_id and q.exam_id=v_exam_id) then raise exception 'Question is not part of this exam'; end if;
  if p_option_id is not null and not exists(select 1 from public.question_options o where o.id=p_option_id and o.question_id=p_question_id) then raise exception 'Selected option is invalid'; end if;
  insert into public.student_answers(attempt_id,student_id,question_id,option_id,marked_for_review,updated_at) values(p_attempt_id,v_student_id,p_question_id,p_option_id,p_marked,now())
  on conflict(attempt_id,question_id) do update set option_id=excluded.option_id,marked_for_review=excluded.marked_for_review,updated_at=now();
end $$;

create or replace function public.finish_exam(p_attempt_id uuid,p_session_token uuid,p_reason text default 'student_submit') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_student_id uuid; v_exam_id uuid; v_exam public.exams%rowtype; v_correct integer; v_incorrect integer; v_unanswered integer; v_marks numeric; v_max numeric; v_submitted timestamptz := now(); v_row public.results%rowtype;
begin
  select s.id,a.exam_id into v_student_id,v_exam_id from public.exam_attempts a join public.students s on s.id=a.student_id where a.id=p_attempt_id and s.profile_id=v_uid and a.session_token=p_session_token and a.status='in_progress' for update of a;
  if not found then
    select r.* into v_row from public.results r join public.exams e on e.id=r.exam_id where r.attempt_id=p_attempt_id and r.student_id=(select id from public.students where profile_id=v_uid);
    if found then
      if (select e.results_published from public.exams e where e.id=v_row.exam_id) then return jsonb_build_object('already_submitted',true,'result_published',true,'marks_obtained',v_row.marks_obtained); end if;
      return jsonb_build_object('already_submitted',true,'result_published',false,'submitted_at',v_row.submitted_at);
    end if;
    raise exception 'Active exam attempt not found';
  end if;
  select * into v_exam from public.exams where id=v_exam_id;
  select count(*) filter(where o.is_correct),count(*) filter(where sa.option_id is not null and not o.is_correct),count(*) filter(where sa.option_id is null),
    coalesce(sum(case when o.is_correct then q.marks when sa.option_id is not null then -v_exam.negative_mark else 0 end),0),coalesce(sum(q.marks),0)
  into v_correct,v_incorrect,v_unanswered,v_marks,v_max from public.questions q left join public.student_answers sa on sa.question_id=q.id and sa.attempt_id=p_attempt_id left join public.question_options o on o.id=sa.option_id and o.question_id=q.id where q.exam_id=v_exam_id;
  v_marks := greatest(0,v_marks);
  update public.exam_attempts set status='submitted',submitted_at=v_submitted where id=p_attempt_id;
  insert into public.results(attempt_id,exam_id,student_id,correct_count,incorrect_count,unanswered_count,marks_obtained,max_marks,percentage,passed,submitted_at)
  values(p_attempt_id,v_exam_id,v_student_id,v_correct,v_incorrect,v_unanswered,v_marks,v_max,round(100*v_marks/nullif(v_max,0),2),v_marks>=v_exam.passing_marks,v_submitted)
  on conflict(attempt_id) do nothing returning * into v_row;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details) values(v_uid,'exam_submitted','exam_attempt',p_attempt_id::text,jsonb_build_object('reason',p_reason));
  if not v_exam.results_published then return jsonb_build_object('already_submitted',false,'result_published',false,'submitted_at',v_submitted); end if;
  return jsonb_build_object('already_submitted',false,'result_published',true,'correct_count',v_correct,'incorrect_count',v_incorrect,'unanswered_count',v_unanswered,'marks_obtained',v_marks,'max_marks',v_max,'percentage',round(100*v_marks/nullif(v_max,0),2),'passed',v_marks>=v_exam.passing_marks,'submitted_at',v_submitted);
end $$;

create or replace function public.record_exam_warning(p_attempt_id uuid,p_session_token uuid,p_event text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_student_id uuid; v_exam_id uuid; v_count integer; v_policy text; v_finish jsonb;
begin
  if p_event not in ('visibility_hidden','window_blur','fullscreen_exit') then raise exception 'Unsupported event'; end if;
  select s.id,a.exam_id,a.warning_count into v_student_id,v_exam_id,v_count from public.exam_attempts a join public.students s on s.id=a.student_id where a.id=p_attempt_id and s.profile_id=v_uid and a.session_token=p_session_token and a.status='in_progress' for update of a;
  if not found then raise exception 'Active attempt not found'; end if;
  if exists(select 1 from public.exam_warnings w where w.attempt_id=p_attempt_id and w.occurred_at>now()-interval '3 seconds') then
    return jsonb_build_object('warning_count',v_count,'action','duplicate');
  end if;
  if v_count>=3 then
    select warning_policy into v_policy from public.exams where id=v_exam_id;
    return jsonb_build_object('warning_count',v_count,'action',case when v_policy='lock' then 'lock' else 'submit' end);
  end if;
  v_count:=v_count+1;
  update public.exam_attempts set warning_count=v_count where id=p_attempt_id;
  insert into public.exam_warnings(attempt_id,student_id,event_type,count_after) values(p_attempt_id,v_student_id,p_event,v_count);
  select warning_policy into v_policy from public.exams where id=v_exam_id;
  if v_count=3 and v_policy='lock' then update public.exam_attempts set status='locked',submitted_at=now() where id=p_attempt_id; end if;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details) values(v_uid,'exam_warning','exam_attempt',p_attempt_id::text,jsonb_build_object('event',p_event,'count',v_count));
  if v_count=3 and v_policy='submit' then
    v_finish:=public.finish_exam(p_attempt_id,p_session_token,'third_warning');
    return jsonb_build_object('warning_count',v_count,'action','submit','result',v_finish);
  end if;
  return jsonb_build_object('warning_count',v_count,'action',case when v_count=3 then v_policy else 'warn' end);
end $$;

revoke all on function public.start_exam(uuid) from public;
revoke all on function public.get_my_exams() from public;
revoke all on function public.get_teacher_results() from public;
revoke all on function public.save_exam_answer(uuid,uuid,uuid,uuid,boolean) from public;
revoke all on function public.finish_exam(uuid,uuid,text) from public;
revoke all on function public.record_exam_warning(uuid,uuid,text) from public;
grant execute on function public.start_exam(uuid) to authenticated;
grant execute on function public.get_my_exams() to authenticated;
grant execute on function public.get_teacher_results() to authenticated;
grant execute on function public.save_exam_answer(uuid,uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.finish_exam(uuid,uuid,text) to authenticated;
grant execute on function public.record_exam_warning(uuid,uuid,text) to authenticated;
-- No client role may change answer keys, attempts, warning records, results, or audit logs directly.
revoke insert, update, delete on public.question_options, public.exam_attempts, public.student_answers, public.exam_warnings, public.results, public.audit_logs from anon, authenticated;
revoke select on public.question_options from anon, authenticated;
grant select on public.question_options to authenticated;
