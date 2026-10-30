-- Extend the reviewed base exam schema with student registration/payment review
-- and trusted teacher paper-authoring workflows. No objects are dropped.
alter table public.exams add column if not exists chapter_name text not null default '';

create table if not exists public.registration_requests (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  requested_group_id uuid not null references public.exam_groups(id),
  roll_number text not null,
  subject text not null check (subject in ('Biology','Physics','Chemistry')),
  chapter_name text not null,
  fee_amount integer not null default 20 check (fee_amount = 20),
  payment_reference text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','verified','rejected')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(requested_group_id, roll_number)
);
create index if not exists registration_review_idx on public.registration_requests(review_status,payment_status,created_at);
alter table public.registration_requests enable row level security;
create policy registration_self_read on public.registration_requests for select to authenticated using (profile_id=(select auth.uid()));
create policy registration_admin_read on public.registration_requests for select to authenticated using (public.is_school_admin());
revoke insert, update, delete on public.registration_requests from anon, authenticated;

create or replace function public.get_registration_reviews() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id',r.profile_id,'full_name',p.full_name,'requested_group_id',r.requested_group_id,'group_name',g.name,
    'roll_number',r.roll_number,'subject',r.subject,'chapter_name',r.chapter_name,'fee_amount',r.fee_amount,
    'payment_reference',r.payment_reference,'payment_status',r.payment_status,'review_status',r.review_status,'created_at',r.created_at
  ) order by r.created_at),'[]'::jsonb) into v_result
  from public.registration_requests r join public.profiles p on p.id=r.profile_id join public.exam_groups g on g.id=r.requested_group_id;
  return v_result;
end $$;

create or replace function public.review_student_registration(p_profile_id uuid,p_payment_accepted boolean,p_admission_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_request public.registration_requests%rowtype; v_group_slug text;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.registration_requests where profile_id=p_profile_id for update;
  if not found then raise exception 'Registration request not found'; end if;
  if p_admission_approved and not p_payment_accepted and v_request.payment_status<>'verified' then raise exception 'Verify the ₹20 payment before approving enrollment'; end if;
  update public.registration_requests set
    payment_status=case when p_payment_accepted then 'verified' when p_admission_approved then payment_status else 'rejected' end,
    review_status=case when p_admission_approved then 'approved' when not p_payment_accepted then 'rejected' else 'pending' end,
    reviewed_by=auth.uid(),reviewed_at=now()
  where profile_id=p_profile_id;
  if p_admission_approved then
    select slug into v_group_slug from public.exam_groups where id=v_request.requested_group_id;
    insert into public.students(profile_id,roll_number,student_code,exam_group_id)
    values(v_request.profile_id,v_request.roll_number,upper(replace(v_group_slug,'-',''))||'-'||upper(v_request.roll_number),v_request.requested_group_id);
  end if;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(auth.uid(),'student_registration_reviewed','student_registration',p_profile_id::text,jsonb_build_object('payment_accepted',p_payment_accepted,'admission_approved',p_admission_approved));
end $$;

-- The auth trigger creates only a student role and a pending request. It never
-- creates an active student roster record or marks payment as verified.
create or replace function public.handle_new_student_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_group_slug text; v_group_id uuid; v_roll text; v_subject text; v_chapter text; v_reference text;
begin
  v_name:=nullif(trim(new.raw_user_meta_data->>'full_name'),'');
  v_group_slug:=new.raw_user_meta_data->>'group_slug';
  v_roll:=nullif(trim(new.raw_user_meta_data->>'roll_number'),'');
  v_subject:=new.raw_user_meta_data->>'subject';
  v_chapter:=nullif(trim(new.raw_user_meta_data->>'chapter_name'),'');
  v_reference:=nullif(trim(new.raw_user_meta_data->>'payment_reference'),'');
  if v_name is null then raise exception 'Full name is required'; end if;
  insert into public.profiles(id,full_name,role) values(new.id,v_name,'student');
  if v_group_slug is not null and v_roll is not null and v_subject in ('Biology','Physics','Chemistry') and v_chapter is not null and v_reference is not null then
    select id into v_group_id from public.exam_groups where slug=v_group_slug;
    if v_group_id is null then raise exception 'Unsupported class'; end if;
    insert into public.registration_requests(profile_id,requested_group_id,roll_number,subject,chapter_name,payment_reference)
    values(new.id,v_group_id,v_roll,v_subject,v_chapter,v_reference);
  end if;
  return new;
end $$;
create trigger on_auth_user_created_student_registration after insert on auth.users
for each row execute function public.handle_new_student_registration();

create or replace function public.create_exam_paper(
  p_title text,p_subject text,p_chapter_name text,p_academic_session text,p_group_slug text,
  p_share_class10 boolean,p_duration_minutes integer,p_passing_marks numeric,p_publish boolean,p_questions jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_group_id uuid; v_other_group_id uuid; v_exam_id uuid; v_question jsonb; v_option jsonb; v_question_id uuid; v_position integer:=0; v_correct_count integer; v_option_count integer; v_total_marks numeric:=0; v_max_marks numeric; v_paper_group public.exam_groups%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  if p_subject not in ('Biology','Physics','Chemistry') then raise exception 'Choose Biology, Physics or Chemistry'; end if;
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_chapter_name,'')))=0 then raise exception 'Exam and chapter names are required'; end if;
  if p_duration_minutes not between 1 and 300 then raise exception 'Duration must be between 1 and 300 minutes'; end if;
  if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)=0 then raise exception 'Add at least one question'; end if;
  select * into v_paper_group from public.exam_groups where slug=p_group_slug;
  if not found then raise exception 'Unsupported class'; end if;
  v_group_id:=v_paper_group.id;
  if not public.can_teach_group(v_group_id) then raise exception 'You are not authorized for this class'; end if;
  if p_share_class10 then
    if p_group_slug not in ('class-10-boys','class-10-girls') then raise exception 'Shared paper is only available for Class 10 Boys and Girls'; end if;
    select id into v_other_group_id from public.exam_groups where slug=case when p_group_slug='class-10-boys' then 'class-10-girls' else 'class-10-boys' end;
    if not public.can_teach_group(v_other_group_id) then raise exception 'You must be authorized for both Class 10 groups to share this paper'; end if;
  end if;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    if length(trim(coalesce(v_question->>'body','')))=0 then raise exception 'Every question needs text'; end if;
    if jsonb_typeof(v_question->'options')<>'array' or jsonb_array_length(v_question->'options')<>4 then raise exception 'Each question needs four options'; end if;
    select count(*),count(*) filter(where coalesce((value->>'is_correct')::boolean,false)) into v_option_count,v_correct_count from jsonb_array_elements(v_question->'options');
    if v_option_count<>4 or v_correct_count<>1 then raise exception 'Each question must have exactly one correct option'; end if;
    if coalesce((v_question->>'marks')::numeric,1)<=0 then raise exception 'Question marks must be positive'; end if;
    v_total_marks:=v_total_marks+coalesce((v_question->>'marks')::numeric,1);
  end loop;
  v_max_marks:=v_total_marks;
  if p_passing_marks<0 or p_passing_marks>v_max_marks then raise exception 'Passing marks must be within the paper maximum'; end if;
  insert into public.exams(exam_group_id,title,subject,chapter_name,academic_session,duration_seconds,max_marks,passing_marks,published,created_by)
  values(v_group_id,trim(p_title),p_subject,trim(p_chapter_name),coalesce(nullif(trim(p_academic_session),''),'Current session'),p_duration_minutes*60,v_max_marks,p_passing_marks,p_publish,v_uid)
  returning id into v_exam_id;
  insert into public.exam_group_assignments(exam_id,exam_group_id) values(v_exam_id,v_group_id);
  if p_share_class10 then insert into public.exam_group_assignments(exam_id,exam_group_id) values(v_exam_id,v_other_group_id); end if;
  for v_question in select value from jsonb_array_elements(p_questions) loop
    v_position:=v_position+1;
    insert into public.questions(exam_id,body,image_url,marks,position)
    values(v_exam_id,trim(v_question->>'body'),nullif(v_question->>'image_url',''),coalesce((v_question->>'marks')::numeric,1),v_position)
    returning id into v_question_id;
    for v_option in select value from jsonb_array_elements(v_question->'options') loop
      insert into public.question_options(question_id,option_label,body,is_correct)
      values(v_question_id,(v_option->>'label')::char(1),trim(v_option->>'body'),coalesce((v_option->>'is_correct')::boolean,false));
    end loop;
  end loop;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(v_uid,'exam_paper_created','exam',v_exam_id::text,jsonb_build_object('subject',p_subject,'chapter',p_chapter_name,'groups',case when p_share_class10 then jsonb_build_array(p_group_slug,'shared-class-10') else jsonb_build_array(p_group_slug) end,'published',p_publish,'question_count',jsonb_array_length(p_questions)));
  return v_exam_id;
end $$;

create or replace function public.get_teacher_papers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'subject',e.subject,'chapter_name',e.chapter_name,'academic_session',e.academic_session,'max_marks',e.max_marks,'passing_marks',e.passing_marks,'duration_seconds',e.duration_seconds,'published',e.published,'results_published',e.results_published,'groups',(
    select jsonb_agg(jsonb_build_object('slug',eg.slug,'name',eg.name) order by eg.slug) from public.exam_group_assignments ega join public.exam_groups eg on eg.id=ega.exam_group_id where ega.exam_id=e.id
  )) order by e.created_at desc),'[]'::jsonb) into v_result
  from public.exams e where exists(select 1 from public.exam_group_assignments ega where ega.exam_id=e.id and public.can_teach_group(ega.exam_group_id));
  return v_result;
end $$;

revoke all on function public.create_exam_paper(text,text,text,text,text,boolean,integer,numeric,boolean,jsonb) from public;
revoke all on function public.get_teacher_papers() from public;
revoke all on function public.get_registration_reviews() from public;
revoke all on function public.review_student_registration(uuid,boolean,boolean) from public;
grant execute on function public.create_exam_paper(text,text,text,text,text,boolean,integer,numeric,boolean,jsonb) to authenticated;
grant execute on function public.get_teacher_papers() to authenticated;
grant execute on function public.get_registration_reviews() to authenticated;
grant execute on function public.review_student_registration(uuid,boolean,boolean) to authenticated;
