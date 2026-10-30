-- Anonymous payment-proof intake for the public exam flow. This records claims only;
-- it does not verify PhonePe transactions or grant exam access. An admin must verify.
create table if not exists public.exam_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  status_token uuid not null unique default gen_random_uuid(),
  student_name text not null check (length(trim(student_name)) between 2 and 120),
  roll_number text not null check (length(trim(roll_number)) between 1 and 32),
  board text not null check (board in ('BSEB','CBSE')),
  exam_group_id uuid not null references public.exam_groups(id),
  subject text not null check (subject in ('Biology','Chemistry','Physics')),
  chapter_name text not null check (length(trim(chapter_name)) between 2 and 140),
  amount_inr integer not null default 20 check (amount_inr=20),
  transaction_reference text not null check (length(trim(transaction_reference)) between 6 and 100),
  payer_upi_id text not null check (length(trim(payer_upi_id)) between 3 and 120),
  payer_name text not null check (length(trim(payer_name)) between 2 and 120),
  paid_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(transaction_reference)
);
create index if not exists exam_payment_pending_idx on public.exam_payment_submissions(status,created_at);
alter table public.exam_payment_submissions enable row level security;
revoke all on public.exam_payment_submissions from anon, authenticated;

create or replace function public.submit_exam_payment(
  p_student_name text,p_roll_number text,p_board text,p_group_slug text,p_subject text,p_chapter_name text,
  p_transaction_reference text,p_payer_upi_id text,p_payer_name text,p_paid_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid; v_token uuid; v_user uuid:=auth.uid();
begin
  if length(trim(coalesce(p_student_name,''))) not between 2 and 120 then raise exception 'Enter the student's full name'; end if;
  if length(trim(coalesce(p_roll_number,''))) not between 1 and 32 then raise exception 'Enter the roll number'; end if;
  if p_board not in ('BSEB','CBSE') then raise exception 'Select a valid board'; end if;
  if p_subject not in ('Biology','Chemistry','Physics') then raise exception 'Select a valid subject'; end if;
  if length(trim(coalesce(p_chapter_name,''))) not between 2 and 140 then raise exception 'Enter the chapter name'; end if;
  if length(trim(coalesce(p_transaction_reference,''))) not between 6 and 100 then raise exception 'Enter a valid PhonePe transaction reference'; end if;
  if length(trim(coalesce(p_payer_upi_id,''))) not between 3 and 120 then raise exception 'Enter the payer UPI ID'; end if;
  if length(trim(coalesce(p_payer_name,''))) not between 2 and 120 then raise exception 'Enter the payer name'; end if;
  if p_paid_at is null or p_paid_at>now() or p_paid_at<now()-interval '30 days' then raise exception 'Enter the correct payment date and time'; end if;
  select id into v_group_id from public.exam_groups where slug=p_group_slug;
  if v_group_id is null then raise exception 'Select a valid class'; end if;
  if not exists(
    select 1 from public.students s join public.profiles pr on pr.id=s.profile_id
    where s.exam_group_id=v_group_id and s.roll_number=trim(p_roll_number) and s.board=p_board
      and lower(trim(pr.full_name))=lower(trim(p_student_name))
  ) then raise exception 'Student name, roll, class and board must match an approved school account'; end if;
  if exists(select 1 from public.exam_payment_submissions where created_at>now()-interval '1 hour' and (transaction_reference=trim(p_transaction_reference) or (lower(student_name)=lower(trim(p_student_name)) and roll_number=trim(p_roll_number)))) then
    raise exception 'A recent payment submission already exists for these details';
  end if;
  insert into public.exam_payment_submissions(student_name,roll_number,board,exam_group_id,subject,chapter_name,transaction_reference,payer_upi_id,payer_name,paid_at)
  values(trim(p_student_name),trim(p_roll_number),p_board,v_group_id,p_subject,trim(p_chapter_name),trim(p_transaction_reference),trim(p_payer_upi_id),trim(p_payer_name),p_paid_at)
  returning status_token into v_token;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(v_user,'exam_payment_claim_submitted','exam_payment',v_token::text,jsonb_build_object('amount_inr',20,'class_group_id',v_group_id));
  return v_token;
end $$;

create or replace function public.get_exam_payment_status(p_status_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_submission public.exam_payment_submissions%rowtype; v_user uuid:=auth.uid();
begin
  select * into v_submission from public.exam_payment_submissions where status_token=p_status_token;
  if not found then raise exception 'Payment request not found'; end if;
  if v_user is not null and not public.is_school_admin() and not exists(
    select 1 from public.students s join public.profiles p on p.id=s.profile_id
    where p.id=v_user and s.roll_number=v_submission.roll_number and s.exam_group_id=v_submission.exam_group_id
      and s.board=v_submission.board and lower(trim(p.full_name))=lower(trim(v_submission.student_name))
  ) then raise exception 'Payment status is not available for this account'; end if;
  return jsonb_build_object('status',v_submission.status);
end $$;

create or replace function public.get_admin_exam_payments() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'student_name',p.student_name,'roll_number',p.roll_number,'board',p.board,'group_name',g.name,
    'subject',p.subject,'chapter_name',p.chapter_name,'amount_inr',p.amount_inr,
    'transaction_reference',p.transaction_reference,'payer_upi_id',p.payer_upi_id,'payer_name',p.payer_name,
    'paid_at',p.paid_at,'status',p.status,'created_at',p.created_at
  ) order by p.created_at desc),'[]'::jsonb) into v_rows
  from public.exam_payment_submissions p join public.exam_groups g on g.id=p.exam_group_id;
  return v_rows;
end $$;

create or replace function public.review_exam_payment(p_submission_id uuid,p_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid; v_request public.exam_payment_submissions%rowtype;
begin
  if not public.is_school_admin() then raise exception 'Administrator access required'; end if;
  select * into v_request from public.exam_payment_submissions where id=p_submission_id and status='pending' for update;
  if not found then raise exception 'Pending payment request not found'; end if;
  v_group_id:=v_request.exam_group_id;
  if p_approved and not exists(
    select 1 from public.students s join public.profiles pr on pr.id=s.profile_id
    where s.exam_group_id=v_request.exam_group_id and s.roll_number=v_request.roll_number
      and s.board=v_request.board and lower(trim(pr.full_name))=lower(trim(v_request.student_name))
  ) then raise exception 'No matching authorized student account exists for this name, roll, class and board'; end if;
  update public.exam_payment_submissions set status=case when p_approved then 'verified' else 'rejected' end,reviewer_id=auth.uid(),reviewed_at=now()
  where id=p_submission_id;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(auth.uid(),case when p_approved then 'exam_payment_verified' else 'exam_payment_rejected' end,'exam_payment',p_submission_id::text,jsonb_build_object('group_id',v_group_id));
end $$;

create or replace function public.require_verified_exam_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_exam public.exams%rowtype; v_student public.students%rowtype; v_name text;
begin
  select * into v_exam from public.exams where id=new.exam_id;
  select s.* into v_student from public.students s where s.id=new.student_id;
  select full_name into v_name from public.profiles where id=v_student.profile_id;
  if not exists(
    select 1 from public.exam_group_assignments ega
    join public.exam_payment_submissions ps on ps.exam_group_id=ega.exam_group_id
    where ega.exam_id=new.exam_id and ega.exam_group_id=v_student.exam_group_id
      and ps.status='verified' and ps.roll_number=v_student.roll_number and ps.board=v_student.board
      and lower(trim(ps.student_name))=lower(trim(v_name))
      and ps.subject=v_exam.subject and lower(trim(ps.chapter_name))=lower(trim(v_exam.chapter_name))
      and ps.reviewed_at>=ps.created_at
  ) then raise exception 'A school-verified ₹20 payment for this exam is required before starting'; end if;
  return new;
end $$;
drop trigger if exists verified_payment_required_for_exam on public.exam_attempts;
create trigger verified_payment_required_for_exam before insert on public.exam_attempts
for each row execute function public.require_verified_exam_payment();

revoke all on function public.submit_exam_payment(text,text,text,text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.get_exam_payment_status(uuid) from public;
revoke all on function public.get_admin_exam_payments() from public;
revoke all on function public.review_exam_payment(uuid,boolean) from public;
grant execute on function public.submit_exam_payment(text,text,text,text,text,text,text,text,text,timestamptz) to anon,authenticated;
grant execute on function public.get_exam_payment_status(uuid) to anon,authenticated;
grant execute on function public.get_admin_exam_payments() to authenticated;
grant execute on function public.review_exam_payment(uuid,boolean) to authenticated;
