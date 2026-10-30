-- Lets a signed-in student resume the payment step for one assigned exam without
-- exposing any other student's payment submissions.
create or replace function public.has_verified_exam_payment(p_exam_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_student public.students%rowtype; v_exam public.exams%rowtype; v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_student from public.students where profile_id = auth.uid();
  if not found then raise exception 'Student profile not found'; end if;
  select e.* into v_exam
  from public.exams e join public.exam_group_assignments ega on ega.exam_id=e.id and ega.exam_group_id=v_student.exam_group_id
  where e.id=p_exam_id and e.published;
  if not found then raise exception 'This exam is not assigned to your class'; end if;
  select full_name into v_name from public.profiles where id=v_student.profile_id;
  return exists (
    select 1 from public.exam_payment_submissions ps
    join public.exam_group_assignments ega on ega.exam_group_id=ps.exam_group_id and ega.exam_id=p_exam_id
    where ps.status='verified' and ps.roll_number=v_student.roll_number and ps.board=v_student.board
      and ps.subject=v_exam.subject and lower(trim(ps.chapter_name))=lower(trim(v_exam.chapter_name))
      and lower(trim(ps.student_name))=lower(trim(v_name)) and ps.reviewed_at>=ps.created_at
  );
end $$;
revoke all on function public.has_verified_exam_payment(uuid) from public,anon;
grant execute on function public.has_verified_exam_payment(uuid) to authenticated;
