-- Only the supplied Class 8-12 student rosters and named school teachers may
-- use the exam application. Roster rows are not readable by students.
create table if not exists public.teacher_roster (
  full_name text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.teacher_roster enable row level security;
drop policy if exists teacher_roster_admin_read on public.teacher_roster;
create policy teacher_roster_admin_read on public.teacher_roster for select to authenticated using (public.is_school_admin());
revoke all on public.teacher_roster from anon,authenticated;
grant select on public.teacher_roster to authenticated;

insert into public.teacher_roster(full_name) values
 ('Waseem Akram'),('Md Naseem'),('Md Meraj'),('Tabrej Alam'),
 ('Md Arif'),('Md Reyaj'),('Nisha Kumari'),('Nargis Bano'),('Er. Faiz')
on conflict(full_name) do update set active=true;

create or replace function public.is_authorized_teacher_login(p_full_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and (
      p.role='admin' or (p.role='teacher'
        and lower(trim(p.full_name))=lower(trim(coalesce(p_full_name,'')))
        and exists(select 1 from public.teacher_roster t where t.active and lower(trim(t.full_name))=lower(trim(p.full_name)))
      )
    )
  );
$$;
revoke all on function public.is_authorized_teacher_login(text) from public,anon;
grant execute on function public.is_authorized_teacher_login(text) to authenticated;

create or replace function public.is_authorized_student_login() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p
    join public.registration_requests rr on rr.profile_id=p.id
    join public.student_roster r on r.exam_group_id=rr.requested_group_id and r.roll_number=rr.roll_number
    join public.exam_groups g on g.id=rr.requested_group_id
    where p.id=(select auth.uid()) and p.role='student'
      and g.slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
      and r.authoritative and r.board=rr.board
      and lower(trim(r.full_name))=lower(trim(p.full_name))
  ) or exists(
    select 1 from public.profiles p
    join public.students s on s.profile_id=p.id
    join public.student_roster r on r.exam_group_id=s.exam_group_id and r.roll_number=s.roll_number
    join public.exam_groups g on g.id=s.exam_group_id
    where p.id=(select auth.uid()) and p.role='student'
      and g.slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
      and r.authoritative and r.board=s.board
      and lower(trim(r.full_name))=lower(trim(p.full_name))
  );
$$;
revoke all on function public.is_authorized_student_login() from public,anon;
grant execute on function public.is_authorized_student_login() to authenticated;

-- Reject public student sign-ups unless the submitted class, subject, chapter,
-- board, roll and name match the exact supplied roster row.
create or replace function public.handle_new_student_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text:=nullif(trim(new.raw_user_meta_data->>'full_name'),'');
  v_group_slug text:=new.raw_user_meta_data->>'group_slug';
  v_group_id uuid;
  v_roll text:=nullif(trim(new.raw_user_meta_data->>'roll_number'),'');
  v_subject text:=new.raw_user_meta_data->>'subject';
  v_chapter text:=nullif(trim(new.raw_user_meta_data->>'chapter_name'),'');
  v_reference text:=nullif(trim(new.raw_user_meta_data->>'payment_reference'),'');
  v_board text:=coalesce(nullif(trim(new.raw_user_meta_data->>'board'),''),'BSEB');
  v_roster public.student_roster%rowtype;
begin
  if v_name is null then raise exception 'Full name is required'; end if;
  if v_board not in ('BSEB','CBSE') then raise exception 'Select a valid board'; end if;

  -- Teacher accounts are provisioned by the school with trusted app metadata.
  if new.app_metadata->>'account_type'='teacher' then
    if not exists(select 1 from public.teacher_roster t where t.active and lower(trim(t.full_name))=lower(trim(v_name))) then
      raise exception 'Teacher name is not on the authorized school list';
    end if;
    insert into public.profiles(id,full_name,role) values(new.id,v_name,'teacher');
    return new;
  end if;

  insert into public.profiles(id,full_name,role) values(new.id,v_name,'student');
  -- Accounts without an enrollment request cannot pass is_authorized_student_login.
  if v_group_slug is null and v_roll is null then return new; end if;
  if v_group_slug not in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
     or v_roll is null or v_chapter is null or v_reference is null then
    raise exception 'Class, chapter, roll number and payment reference are required';
  end if;

  if not (
    (v_group_slug='class-8' and v_subject='Biology' and v_chapter='Microbes: Friend and Foe') or
    (v_group_slug='class-9' and v_subject='Physics' and v_chapter='Motion') or
    (v_group_slug in ('class-10-boys','class-10-girls') and v_subject='Biology' and v_chapter='Control and Coordination') or
    (v_group_slug='class-11' and v_subject='Biology' and v_chapter='Biological Classification') or
    (v_group_slug='class-12' and v_subject='Biology' and v_chapter='Sexual Reproduction in Flowering Plants')
  ) then raise exception 'Select the authorized subject and chapter for your class'; end if;

  select id into v_group_id from public.exam_groups where slug=v_group_slug;
  if v_group_id is null then raise exception 'Unsupported class'; end if;
  select * into v_roster from public.student_roster r
  where r.exam_group_id=v_group_id and r.roll_number=v_roll and r.authoritative;
  if not found or v_roster.board<>v_board or lower(trim(v_roster.full_name))<>lower(trim(v_name)) then
    raise exception 'Student name, roll number and board do not match the authorized class roster';
  end if;

  insert into public.registration_requests(profile_id,requested_group_id,roll_number,subject,chapter_name,payment_reference,board)
  values(new.id,v_group_id,v_roll,v_subject,v_chapter,v_reference,v_board);
  return new;
end $$;

-- Give existing, already-provisioned allowlisted teachers their class scopes.
insert into public.teacher_groups(teacher_id,exam_group_id)
select p.id,g.id
from public.profiles p
join public.teacher_roster t on t.active and lower(trim(t.full_name))=lower(trim(p.full_name))
cross join public.exam_groups g
where p.role='teacher' and g.slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
on conflict(teacher_id,exam_group_id) do nothing;

create or replace function public.assign_allowlisted_teacher_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role='teacher' and exists(
    select 1 from public.teacher_roster t where t.active and lower(trim(t.full_name))=lower(trim(new.full_name))
  ) then
    insert into public.teacher_groups(teacher_id,exam_group_id)
    select new.id,g.id from public.exam_groups g
    where g.slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
    on conflict(teacher_id,exam_group_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists assign_allowlisted_teacher_groups on public.profiles;
create trigger assign_allowlisted_teacher_groups after insert or update of role on public.profiles
for each row execute function public.assign_allowlisted_teacher_groups();
