-- The teacher page uses the school's server-configured Auth account, with the
-- entered teacher name checked against the approved list. No email is exposed.
create or replace function public.is_authorized_teacher_login(p_full_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and (
      p.role='admin' or (
        p.role='teacher'
        and exists(select 1 from public.teacher_roster own where own.active and lower(trim(own.full_name))=lower(trim(p.full_name)))
        and exists(select 1 from public.teacher_roster selected where selected.active and lower(trim(selected.full_name))=lower(trim(coalesce(p_full_name,''))))
      )
    )
  );
$$;

create or replace function public.is_authorized_school_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_school_admin() or exists(
    select 1 from public.profiles p join public.teacher_roster t
      on t.active and lower(trim(t.full_name))=lower(trim(p.full_name))
    where p.id=(select auth.uid()) and p.role='teacher'
  );
$$;
revoke all on function public.is_authorized_school_teacher() from public,anon;
grant execute on function public.is_authorized_school_teacher() to authenticated;

-- Teacher RLS and paper authoring scopes are limited to the named teacher list.
create or replace function public.can_teach_group(group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_school_admin() or (
    public.is_authorized_school_teacher()
    and exists(select 1 from public.teacher_groups tg where tg.teacher_id=(select auth.uid()) and tg.exam_group_id=group_id)
  );
$$;

-- Keep all-school visibility for the live monitor while validating teacher identity.
create or replace function public.get_active_proctor_sessions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null or not public.is_authorized_school_teacher() then raise exception 'Authorized teacher access required'; end if;
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
  extension='broadcast' and realtime.topic() like 'exam-proctor:%'
  and exists(
    select 1 from public.exam_attempts a
    join public.students s on s.id=a.student_id
    join public.exam_group_assignments ega on ega.exam_id=a.exam_id and ega.exam_group_id=s.exam_group_id
    where realtime.topic()='exam-proctor:'||a.exam_id::text and a.status='in_progress' and a.expires_at>now()
      and (public.is_authorized_school_teacher() or (
        s.profile_id=(select auth.uid()) and a.id::text=payload->>'attempt_id' and s.id::text=payload->>'student_id'
      ))
  )
);
