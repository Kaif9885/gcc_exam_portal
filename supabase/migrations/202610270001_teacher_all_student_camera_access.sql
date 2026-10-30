-- Teachers/admins can monitor every active student attempt. Students can read
-- only camera frames tied to their own active attempt and student identity.
create or replace function public.get_active_proctor_sessions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null or not exists(
    select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')
  ) then raise exception 'Teacher access required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'exam_id',a.exam_id,'attempt_id',a.id,'student_id',s.id,'student_name',pr.full_name,
    'roll_number',s.roll_number,'group_name',eg.name,'exam_title',e.title,'subject',e.subject,'started_at',a.started_at
  ) order by eg.name,s.roll_number),'[]'::jsonb) into v_rows
  from public.exam_attempts a
  join public.students s on s.id=a.student_id
  join public.profiles pr on pr.id=s.profile_id
  join public.exams e on e.id=a.exam_id
  join public.exam_group_assignments ega on ega.exam_id=e.id and ega.exam_group_id=s.exam_group_id
  join public.exam_groups eg on eg.id=s.exam_group_id
  where a.status='in_progress' and a.expires_at>now();
  return v_rows;
end $$;

revoke all on function public.get_active_proctor_sessions() from public;
grant execute on function public.get_active_proctor_sessions() to authenticated;

drop policy if exists proctor_read_exam_authorized on realtime.messages;
create policy proctor_read_exam_authorized on realtime.messages for select to authenticated using (
  extension='broadcast'
  and realtime.topic() like 'exam-proctor:%'
  and exists(
    select 1
    from public.exam_attempts a
    join public.students s on s.id=a.student_id
    join public.exam_group_assignments ega on ega.exam_id=a.exam_id and ega.exam_group_id=s.exam_group_id
    where realtime.topic()='exam-proctor:'||a.exam_id::text
      and a.status='in_progress' and a.expires_at>now()
      and (
        exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('teacher','admin'))
        or (
          s.profile_id=(select auth.uid())
          and a.id::text=payload->>'attempt_id'
          and s.id::text=payload->>'student_id'
        )
      )
  )
);
