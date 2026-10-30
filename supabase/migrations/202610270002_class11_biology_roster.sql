-- Class 11 Biology roster supplied by the school. Names and rolls remain admin-only.
insert into public.student_roster(exam_group_id,roll_number,full_name,board)
select g.id,v.roll_number,v.full_name,'BSEB'
from public.exam_groups g
cross join (values
 ('1','Pawan Kumar'),('2','Reetu Kumari'),('3','Sahina'),('4','Putul Kumari'),
 ('5','Afreen Khatoon'),('6','Rajeev Kumar'),('7','Rukaiya Khatoon'),
 ('8','Nandani Gupta'),('9','Ayesha Khatoon')
) as v(roll_number,full_name)
where g.slug='class-11'
on conflict(exam_group_id,roll_number) do update set full_name=excluded.full_name,board=excluded.board,authoritative=true;

-- Require Class 11 applicants to match the supplied name/roll roster before admission.
create or replace function public.review_student_registration(p_profile_id uuid,p_payment_accepted boolean,p_admission_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_request public.registration_requests%rowtype; v_group_slug text; v_roster public.student_roster%rowtype; v_student_code text;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.registration_requests where profile_id=p_profile_id for update;
  if not found then raise exception 'Registration request not found'; end if;
  if p_admission_approved and not p_payment_accepted and v_request.payment_status<>'verified' then raise exception 'Verify the ₹20 payment before approving enrollment'; end if;
  select slug into v_group_slug from public.exam_groups where id=v_request.requested_group_id;
  if p_admission_approved and v_group_slug in ('class-11','class-12') then
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
