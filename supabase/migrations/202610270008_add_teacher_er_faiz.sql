insert into public.teacher_roster(full_name,active)
values('Er. Faiz',true)
on conflict(full_name) do update set active=true;

insert into public.teacher_groups(teacher_id,exam_group_id)
select p.id,g.id
from public.profiles p
join public.teacher_roster t on t.active and lower(trim(t.full_name))=lower(trim(p.full_name))
cross join public.exam_groups g
where p.role='teacher' and lower(trim(p.full_name))=lower(trim('Er. Faiz'))
  and g.slug in ('class-8','class-9','class-10-boys','class-10-girls','class-11','class-12')
on conflict(teacher_id,exam_group_id) do nothing;
