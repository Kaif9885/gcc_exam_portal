-- Teacher-only question-paper preview and private, transient camera-frame broadcast.
-- Students must explicitly accept the school's disclosed camera requirement before
-- the browser requests permission. Frames are broadcast only and are not persisted.
alter table public.exam_attempts add column if not exists camera_consent_at timestamptz;

create or replace function public.start_exam(p_exam_id uuid,p_camera_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_payload jsonb; v_attempt_id uuid;
begin
  if not coalesce(p_camera_consent,false) then raise exception 'Explicit camera consent is required for this proctored exam'; end if;
  v_payload:=public.start_exam(p_exam_id);
  v_attempt_id:=(v_payload->>'attempt_id')::uuid;
  update public.exam_attempts a set camera_consent_at=coalesce(a.camera_consent_at,now())
  from public.students s where a.id=v_attempt_id and s.id=a.student_id and s.profile_id=v_uid;
  if not found then raise exception 'Could not record camera consent for this exam attempt'; end if;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(v_uid,'exam_camera_consent','exam_attempt',v_attempt_id::text,jsonb_build_object('consent_recorded',true,'captured_at',now()));
  return v_payload;
end $$;
revoke all on function public.start_exam(uuid) from public,anon,authenticated;
revoke all on function public.start_exam(uuid,boolean) from public;
grant execute on function public.start_exam(uuid,boolean) to authenticated;

create or replace function public.get_teacher_paper_questions(p_exam_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  if not exists(select 1 from public.exams e join public.exam_group_assignments ega on ega.exam_id=e.id where e.id=p_exam_id and public.can_teach_group(ega.exam_group_id)) then raise exception 'You are not authorized to view this paper'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'position',q.position,'body',q.body,'image_url',q.image_url,'marks',q.marks,'options',(
    select coalesce(jsonb_agg(jsonb_build_object('label',o.option_label,'body',o.body,'is_correct',o.is_correct) order by o.option_label),'[]'::jsonb)
    from public.question_options o where o.question_id=q.id
  )) order by q.position),'[]'::jsonb) into v_result from public.questions q where q.exam_id=p_exam_id;
  return v_result;
end $$;

create or replace function public.get_active_proctor_sessions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('teacher','admin')) then raise exception 'Teacher access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'exam_id',a.exam_id,'attempt_id',a.id,'student_id',s.id,'student_name',pr.full_name,
    'roll_number',s.roll_number,'group_name',eg.name,'exam_title',e.title,'subject',e.subject,'started_at',a.started_at
  ) order by eg.name,s.roll_number),'[]'::jsonb) into v_rows
  from public.exam_attempts a join public.students s on s.id=a.student_id
  join public.profiles pr on pr.id=s.profile_id join public.exams e on e.id=a.exam_id
  join public.exam_group_assignments ega on ega.exam_id=e.id and ega.exam_group_id=s.exam_group_id
  join public.exam_groups eg on eg.id=s.exam_group_id
  where a.status='in_progress' and a.expires_at>now() and public.can_teach_group(s.exam_group_id);
  return v_rows;
end $$;

revoke all on function public.get_teacher_paper_questions(uuid) from public;
revoke all on function public.get_active_proctor_sessions() from public;
grant execute on function public.get_teacher_paper_questions(uuid) to authenticated;
grant execute on function public.get_active_proctor_sessions() to authenticated;

-- Private Realtime topics are scoped by exam UUID. Students may broadcast only from
-- their own active attempt; assigned teachers/admins may subscribe to that exam topic.
drop policy if exists proctor_read_exam_authorized on realtime.messages;
create policy proctor_read_exam_authorized on realtime.messages for select to authenticated using (
  extension='broadcast' and realtime.topic() like 'exam-proctor:%' and exists(
    select 1 from public.exam_attempts a join public.students s on s.id=a.student_id
    join public.exam_group_assignments ega on ega.exam_id=a.exam_id and ega.exam_group_id=s.exam_group_id
    where realtime.topic()='exam-proctor:'||a.exam_id::text and a.status='in_progress' and a.expires_at>now()
      and (s.profile_id=(select auth.uid()) or public.can_teach_group(ega.exam_group_id))
  )
);
drop policy if exists proctor_insert_own_attempt on realtime.messages;
create policy proctor_insert_own_attempt on realtime.messages for insert to authenticated with check (
  extension='broadcast' and realtime.topic() like 'exam-proctor:%' and exists(
    select 1 from public.exam_attempts a join public.students s on s.id=a.student_id
    where realtime.topic()='exam-proctor:'||a.exam_id::text and a.id::text=payload->>'attempt_id'
      and s.id::text=payload->>'student_id' and s.profile_id=(select auth.uid())
      and a.status='in_progress' and a.expires_at>now()
  )
);
