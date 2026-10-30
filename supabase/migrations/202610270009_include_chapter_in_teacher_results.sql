create or replace function public.get_teacher_results() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  with scoped as (
    select r.*,e.title as exam_title,e.subject,e.chapter_name,e.academic_session,ega.exam_group_id,eg.name as group_name,
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
    'exam_id',exam_id,'attempt_id',attempt_id,'exam_title',exam_title,'subject',subject,'chapter_name',chapter_name,'academic_session',academic_session,
    'exam_group_id',exam_group_id,'group_name',group_name,'full_name',full_name,'roll_number',roll_number,'student_code',student_code,
    'section',section,'correct_count',correct_count,'incorrect_count',incorrect_count,'unanswered_count',unanswered_count,
    'marks_obtained',marks_obtained,'max_marks',max_marks,'percentage',percentage,'passed',passed,'submitted_at',submitted_at,'rank',class_rank
  ) order by group_name,exam_title,class_rank),'[]'::jsonb) into v_result from scoped;
  return v_result;
end $$;
