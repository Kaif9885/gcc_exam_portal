-- Camera proctoring has been removed from the application. Preserve the existing
-- authenticated start/resume RPC contract while no longer requiring consent or
-- recording camera-consent audit events.

create or replace function public.start_exam(p_exam_id uuid, p_camera_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_group_slug text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select s.exam_group_id, g.slug into v_group_id, v_group_slug
  from public.students s join public.exam_groups g on g.id = s.exam_group_id
  where s.profile_id = v_uid;
  if not found then raise exception 'Student profile not found'; end if;
  if v_group_slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
    and not public.is_authorized_student_roster(v_uid, v_group_id) then
    raise exception 'Your name and roll number are not on the authorized class roster';
  end if;
  return public.start_exam(p_exam_id);
end $$;

revoke all on function public.start_exam(uuid,boolean) from public;
grant execute on function public.start_exam(uuid,boolean) to authenticated;

create or replace function public.resume_exam(p_exam_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_group_slug text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.exam_attempts a
    join public.students s on s.id = a.student_id
    where a.exam_id = p_exam_id and s.profile_id = v_uid
      and a.status = 'in_progress' and a.expires_at > now()
  ) then raise exception 'No active exam attempt can be resumed'; end if;
  select s.exam_group_id, g.slug into v_group_id, v_group_slug
  from public.students s join public.exam_groups g on g.id = s.exam_group_id
  where s.profile_id = v_uid;
  if v_group_slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
    and not public.is_authorized_student_roster(v_uid, v_group_id) then
    raise exception 'Your name and roll number are not on the authorized class roster';
  end if;
  return public.start_exam(p_exam_id);
end $$;

revoke all on function public.resume_exam(uuid) from public, anon;
grant execute on function public.resume_exam(uuid) to authenticated;
