-- Transaction reference and payer UPI are no longer collected from students.
-- Keep the columns nullable so existing payment submissions remain intact.
alter table public.exam_payment_submissions
  alter column transaction_reference drop not null,
  alter column payer_upi_id drop not null;

alter table public.exam_payment_submissions
  drop constraint if exists exam_payment_submissions_transaction_reference_check,
  drop constraint if exists exam_payment_submissions_payer_upi_id_check,
  drop constraint if exists exam_payment_submissions_transaction_reference_key;

create or replace function public.submit_exam_payment(
  p_student_name text,p_roll_number text,p_board text,p_group_slug text,p_subject text,p_chapter_name text,
  p_transaction_reference text,p_payer_upi_id text,p_payer_name text,p_paid_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid; v_token uuid; v_user uuid:=auth.uid();
begin
  if length(trim(coalesce(p_student_name,''))) not between 2 and 120 then raise exception 'Enter the student''s full name'; end if;
  if length(trim(coalesce(p_roll_number,''))) not between 1 and 32 then raise exception 'Enter the roll number'; end if;
  if p_board not in ('BSEB','CBSE') then raise exception 'Select a valid board'; end if;
  if p_subject not in ('Biology','Chemistry','Physics') then raise exception 'Select a valid subject'; end if;
  if length(trim(coalesce(p_chapter_name,''))) not between 2 and 140 then raise exception 'Enter the chapter name'; end if;
  if length(trim(coalesce(p_payer_name,''))) not between 2 and 120 then raise exception 'Enter the payer name'; end if;
  if p_paid_at is null or p_paid_at>now() or p_paid_at<now()-interval '30 days' then raise exception 'Enter the correct payment date and time'; end if;
  select id into v_group_id from public.exam_groups where slug=p_group_slug;
  if v_group_id is null then raise exception 'Select a valid class'; end if;
  if not exists(
    select 1 from public.students s join public.profiles pr on pr.id=s.profile_id
    where s.exam_group_id=v_group_id and s.roll_number=trim(p_roll_number) and s.board=p_board
      and lower(trim(pr.full_name))=lower(trim(p_student_name))
  ) then raise exception 'Student name, roll, class and board must match an approved school account'; end if;
  if exists(select 1 from public.exam_payment_submissions where created_at>now()-interval '1 hour'
    and lower(student_name)=lower(trim(p_student_name)) and roll_number=trim(p_roll_number)) then
    raise exception 'A recent payment submission already exists for these details';
  end if;
  insert into public.exam_payment_submissions(student_name,roll_number,board,exam_group_id,subject,chapter_name,transaction_reference,payer_upi_id,payer_name,paid_at)
  values(trim(p_student_name),trim(p_roll_number),p_board,v_group_id,p_subject,trim(p_chapter_name),
    nullif(trim(coalesce(p_transaction_reference,'')),''),nullif(trim(coalesce(p_payer_upi_id,'')),''),trim(p_payer_name),p_paid_at)
  returning status_token into v_token;
  insert into public.audit_logs(actor_id,action,object_type,object_id,details)
  values(v_user,'exam_payment_claim_submitted','exam_payment',v_token::text,jsonb_build_object('amount_inr',20,'class_group_id',v_group_id));
  return v_token;
end $$;

revoke all on function public.submit_exam_payment(text,text,text,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.submit_exam_payment(text,text,text,text,text,text,text,text,text,timestamptz) to anon,authenticated;
