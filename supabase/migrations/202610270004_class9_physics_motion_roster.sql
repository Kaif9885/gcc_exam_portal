-- Class 9 roster supplied by the school. Class 9 accounts must match this list.
insert into public.student_roster(exam_group_id,roll_number,full_name,board)
select g.id,v.roll_number,v.full_name,'BSEB'
from public.exam_groups g
cross join (values
 ('1','Anish Yadav'),('2','Shaista Parween'),('3','Raunak Parveen'),('4','Karishma Kumari'),
 ('5','Karina Yadav'),('6','Niki Kumari'),('7','Khushi Kumari Sani'),('8','Khushi Kumari'),
 ('9','Ragni Kumari'),('10','Zoya Khan'),('11','Akriti Kumari'),('12','Kaynat'),
 ('13','Anu Kumari'),('14','Prity Kumari 1'),('15','Prity Kumari Pandit'),('16','Sabrin Khatoon'),
 ('17','Neha Khatoon'),('18','Sana Khatoon'),('19','Md Afak Ahmad'),('20','Indrajeet Kr. Mahto'),
 ('21','Sanam Kri'),('22','Yuvraj Kr. Shah'),('23','Vivek Kumar'),('24','Prity Kumari 2'),
 ('25','Mohini Sharma'),('26','Md Sajid'),('27','Ansui Kumari'),('28','Sameer'),
 ('29','Mahvish Nazeer'),('30','Chandan Kumar'),('31','Sabba Parvin'),('32','Zishan'),
 ('33','Mahira Parveen')
) as v(roll_number,full_name)
where g.slug='class-9'
on conflict(exam_group_id,roll_number) do update set full_name=excluded.full_name,board=excluded.board,authoritative=true;

-- Roster match is enforced for all named cohorts before papers are visible or started.
create or replace function public.is_authorized_student_roster(p_profile_id uuid,p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.students s
    join public.profiles p on p.id=s.profile_id
    join public.student_roster r on r.exam_group_id=s.exam_group_id and r.roll_number=s.roll_number
    join public.exam_groups g on g.id=s.exam_group_id
    where s.profile_id=p_profile_id and s.exam_group_id=p_group_id
      and g.slug in ('class-9','class-10-boys','class-10-girls','class-11','class-12')
      and r.authoritative and r.board=s.board
      and lower(trim(r.full_name))=lower(trim(p.full_name))
  );
$$;
revoke all on function public.is_authorized_student_roster(uuid,uuid) from public,anon;
grant execute on function public.is_authorized_student_roster(uuid,uuid) to authenticated;

drop policy if exists exams_student_read_published on public.exams;
create policy exams_student_read_published on public.exams for select to authenticated using (
  published and exists(
    select 1 from public.exam_group_assignments ega
    join public.students s on s.exam_group_id=ega.exam_group_id and s.profile_id=(select auth.uid())
    join public.exam_groups g on g.id=s.exam_group_id
    where ega.exam_id=exams.id and (g.slug not in ('class-9','class-10-boys','class-10-girls','class-11','class-12') or public.is_authorized_student_roster(s.profile_id,s.exam_group_id))
  )
);

drop policy if exists assignments_read_scope on public.exam_group_assignments;
create policy assignments_read_scope on public.exam_group_assignments for select to authenticated using (
  public.can_teach_group(exam_group_id) or exists(
    select 1 from public.students s join public.exam_groups g on g.id=s.exam_group_id
    where s.profile_id=(select auth.uid()) and s.exam_group_id=exam_group_assignments.exam_group_id
      and (g.slug not in ('class-9','class-10-boys','class-10-girls','class-11','class-12') or public.is_authorized_student_roster(s.profile_id,s.exam_group_id))
  )
);

drop policy if exists questions_student_read on public.questions;
create policy questions_student_read on public.questions for select to authenticated using (
  exists(
    select 1 from public.exams e
    join public.exam_group_assignments ega on ega.exam_id=e.id
    join public.students s on s.exam_group_id=ega.exam_group_id and s.profile_id=(select auth.uid())
    join public.exam_groups g on g.id=s.exam_group_id
    where e.id=questions.exam_id and e.published
      and (g.slug not in ('class-9','class-10-boys','class-10-girls','class-11','class-12') or public.is_authorized_student_roster(s.profile_id,s.exam_group_id))
  )
);

create or replace function public.start_exam(p_exam_id uuid,p_camera_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_group_id uuid; v_group_slug text; v_payload jsonb; v_attempt_id uuid;
begin
  if not coalesce(p_camera_consent,false) then raise exception 'Explicit camera consent is required for this proctored exam'; end if;
  select s.exam_group_id,g.slug into v_group_id,v_group_slug
  from public.students s join public.exam_groups g on g.id=s.exam_group_id where s.profile_id=v_uid;
  if v_group_slug in ('class-9','class-10-boys','class-10-girls','class-11','class-12') and not public.is_authorized_student_roster(v_uid,v_group_id) then
    raise exception 'Your name and roll number are not on the authorized class roster';
  end if;
  v_payload:=public.start_exam(p_exam_id);
  v_attempt_id:=(v_payload->>'attempt_id')::uuid;
  update public.exam_attempts a set camera_consent_at=coalesce(a.camera_consent_at,now())
  from public.students s where a.id=v_attempt_id and s.id=a.student_id and s.profile_id=v_uid;
  if not found then raise exception 'Could not record camera consent for this exam attempt'; end if;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(v_uid,'exam_camera_consent','exam_attempt',v_attempt_id::text,jsonb_build_object('consent_recorded',true,'captured_at',now()));
  return v_payload;
end $$;
revoke all on function public.start_exam(uuid,boolean) from public;
grant execute on function public.start_exam(uuid,boolean) to authenticated;

create or replace function public.review_student_registration(p_profile_id uuid,p_payment_accepted boolean,p_admission_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_request public.registration_requests%rowtype; v_group_slug text; v_roster public.student_roster%rowtype; v_student_code text;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.registration_requests where profile_id=p_profile_id for update;
  if not found then raise exception 'Registration request not found'; end if;
  if p_admission_approved and not p_payment_accepted and v_request.payment_status<>'verified' then raise exception 'Verify the ₹20 payment before approving enrollment'; end if;
  select slug into v_group_slug from public.exam_groups where id=v_request.requested_group_id;
  if p_admission_approved and v_group_slug in ('class-9','class-10-boys','class-10-girls','class-11','class-12') then
    select * into v_roster from public.student_roster r where r.exam_group_id=v_request.requested_group_id and r.roll_number=v_request.roll_number and r.authoritative;
    if not found or lower(trim(v_roster.full_name))<>lower(trim((select full_name from public.profiles where id=p_profile_id))) then
      raise exception 'Student name and roll number do not match the authorized class roster';
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
