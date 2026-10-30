create or replace function public.resume_exam(p_exam_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1
    from public.exam_attempts a
    join public.students s on s.id=a.student_id
    where a.exam_id=p_exam_id
      and s.profile_id=v_uid
      and a.status='in_progress'
      and a.expires_at>now()
      and a.camera_consent_at is not null
  ) then raise exception 'No active, consented exam attempt can be resumed'; end if;
  return public.start_exam(p_exam_id);
end $$;

revoke all on function public.resume_exam(uuid) from public,anon;
grant execute on function public.resume_exam(uuid) to authenticated;
