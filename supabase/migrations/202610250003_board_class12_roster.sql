-- Board metadata, the supplied Class 12 name/roll roster, and admin-only roster checks.
-- This migration contains student personal data supplied by the school; keep source
-- control and database access restricted to authorized school administrators.
alter table public.students add column if not exists board text not null default 'BSEB'
  check (board in ('BSEB','CBSE'));
alter table public.registration_requests add column if not exists board text not null default 'BSEB'
  check (board in ('BSEB','CBSE'));

create table if not exists public.student_roster (
  id uuid primary key default gen_random_uuid(),
  exam_group_id uuid not null references public.exam_groups(id),
  roll_number text not null,
  full_name text not null,
  board text not null default 'BSEB' check (board in ('BSEB','CBSE')),
  authoritative boolean not null default true,
  created_at timestamptz not null default now(),
  unique(exam_group_id,roll_number)
);
alter table public.student_roster enable row level security;
create policy roster_admin_read on public.student_roster for select to authenticated using (public.is_school_admin());
revoke all on public.student_roster from anon, authenticated;
grant select on public.student_roster to authenticated;

insert into public.student_roster(exam_group_id,roll_number,full_name,board)
select g.id,v.roll_number,v.full_name,'BSEB'
from public.exam_groups g
cross join (values
 ('1','Madhu'),('2','Neha Khatoon'),('3','Alisha Khatoon'),('4','Yasmin Parween'),
 ('5','Afreen'),('6','Aasma Parween'),('7','Manisha Kumari'),('8','Sandhya Sah'),
 ('9','Naziya Khan'),('10','Nagma'),('11','Shaista Khatoon'),('12','Vicky Kumar'),
 ('13','Sajeb Ali'),('14','Princy Sharma'),('15','Ravi Kumar'),('16','Shama Khatoon'),
 ('17','Sabbu Khatoon'),('18','Talat Fatma'),('19','Sabbu Khatoon')
) as v(roll_number,full_name)
where g.slug='class-12'
on conflict(exam_group_id,roll_number) do update set full_name=excluded.full_name,board=excluded.board;

create or replace function public.handle_new_student_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_group_slug text; v_group_id uuid; v_roll text; v_subject text; v_chapter text; v_reference text; v_board text;
begin
  v_name:=nullif(trim(new.raw_user_meta_data->>'full_name'),'');
  v_group_slug:=new.raw_user_meta_data->>'group_slug';
  v_roll:=nullif(trim(new.raw_user_meta_data->>'roll_number'),'');
  v_subject:=new.raw_user_meta_data->>'subject';
  v_chapter:=nullif(trim(new.raw_user_meta_data->>'chapter_name'),'');
  v_reference:=nullif(trim(new.raw_user_meta_data->>'payment_reference'),'');
  v_board:=coalesce(nullif(trim(new.raw_user_meta_data->>'board'),''),'BSEB');
  if v_name is null then raise exception 'Full name is required'; end if;
  if v_board not in ('BSEB','CBSE') then raise exception 'Select a valid board'; end if;
  insert into public.profiles(id,full_name,role) values(new.id,v_name,'student');
  if v_group_slug is not null and v_roll is not null and v_subject in ('Biology','Physics','Chemistry') and v_chapter is not null and v_reference is not null then
    select id into v_group_id from public.exam_groups where slug=v_group_slug;
    if v_group_id is null then raise exception 'Unsupported class'; end if;
    insert into public.registration_requests(profile_id,requested_group_id,roll_number,subject,chapter_name,payment_reference,board)
    values(new.id,v_group_id,v_roll,v_subject,v_chapter,v_reference,v_board);
  end if;
  return new;
end $$;

create or replace function public.get_my_result_lookup(
  p_board text,p_group_slug text,p_subject text,p_chapter_name text,p_full_name text,p_roll_number text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_student public.students%rowtype; v_name text; v_group_id uuid; v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in to view your result'; end if;
  select * into v_student from public.students where profile_id=v_uid;
  if not found then raise exception 'Your school enrollment is still under review'; end if;
  select full_name into v_name from public.profiles where id=v_uid;
  select id into v_group_id from public.exam_groups where slug=p_group_slug;
  if v_student.exam_group_id is distinct from v_group_id or v_student.board<>p_board or v_student.roll_number<>trim(p_roll_number) or lower(trim(v_name))<>lower(trim(p_full_name)) then
    raise exception 'Entered student details do not match your signed-in school account';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'exam_title',e.title,'subject',e.subject,'chapter_name',e.chapter_name,'class_name',g.name,
    'academic_session',e.academic_session,'correct_count',r.correct_count,'incorrect_count',r.incorrect_count,
    'unanswered_count',r.unanswered_count,'marks_obtained',r.marks_obtained,'max_marks',r.max_marks,
    'percentage',r.percentage,'passed',r.passed,'submitted_at',r.submitted_at
  ) order by r.submitted_at desc),'[]'::jsonb) into v_result
  from public.results r join public.exams e on e.id=r.exam_id
  join public.exam_group_assignments ega on ega.exam_id=e.id and ega.exam_group_id=v_student.exam_group_id
  join public.exam_groups g on g.id=ega.exam_group_id
  where r.student_id=v_student.id and e.results_published and e.subject=p_subject and lower(trim(e.chapter_name))=lower(trim(p_chapter_name));
  return v_result;
end $$;

revoke all on function public.get_my_result_lookup(text,text,text,text,text,text) from public;
grant execute on function public.get_my_result_lookup(text,text,text,text,text,text) to authenticated;

create or replace function public.review_student_registration(p_profile_id uuid,p_payment_accepted boolean,p_admission_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_request public.registration_requests%rowtype; v_group_slug text; v_roster public.student_roster%rowtype; v_student_code text;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.registration_requests where profile_id=p_profile_id for update;
  if not found then raise exception 'Registration request not found'; end if;
  if p_admission_approved and not p_payment_accepted and v_request.payment_status<>'verified' then raise exception 'Verify the ₹20 payment before approving enrollment'; end if;
  select slug into v_group_slug from public.exam_groups where id=v_request.requested_group_id;
  if p_admission_approved and v_group_slug='class-12' then
    select * into v_roster from public.student_roster r where r.exam_group_id=v_request.requested_group_id and r.roll_number=v_request.roll_number and r.authoritative;
    if not found or lower(trim(v_roster.full_name))<>lower(trim((select full_name from public.profiles where id=p_profile_id))) then
      raise exception 'Class 12 name and roll number do not match the authorized roster';
    end if;
    if v_roster.board<>v_request.board then raise exception 'Selected board does not match the authorized roster'; end if;
  end if;
  update public.registration_requests set
    payment_status=case when p_payment_accepted then 'verified' when p_admission_approved then payment_status else 'rejected' end,
    review_status=case when p_admission_approved then 'approved' when not p_payment_accepted then 'rejected' else 'pending' end,
    reviewed_by=auth.uid(),reviewed_at=now()
  where profile_id=p_profile_id;
  if p_admission_approved then
    v_student_code:=upper(replace(v_group_slug,'-',''))||'-'||upper(v_request.roll_number);
    insert into public.students(profile_id,roll_number,student_code,exam_group_id,board)
    values(v_request.profile_id,v_request.roll_number,v_student_code,v_request.requested_group_id,v_request.board);
  end if;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(auth.uid(),'student_registration_reviewed','student_registration',p_profile_id::text,jsonb_build_object('payment_accepted',p_payment_accepted,'admission_approved',p_admission_approved,'board',v_request.board));
end $$;
