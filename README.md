# Glorious High-Tech School — Examination Portal

Responsive Next.js application for a school examination portal. MongoDB Atlas is the intended application database. Existing student, exam, payment and teacher routes still contain Supabase-backed runtime calls, so do not remove their environment settings or use the app without completing the cutover.

> **Migration status:** MongoDB collections/indexes and a one-time read-only import script are in place. Live Supabase data has not yet been copied, and the app's existing runtime APIs have not all been switched to Atlas.

## Requirements

- Node.js 20.19+ or 22.13+ (the local Node 23 install may show dependency engine warnings)
- npm
- A Supabase project for the current sign-in, exam, payment, paper and result flows
- A MongoDB Atlas cluster for the planned database migration

## Local setup

1. Install packages: `npm install`
2. Set `MONGODB_URI` and `MONGODB_DB=glorious_exams` in `.env.local`. In Atlas, allow your current development IP in Network Access and create a database user with read/write access to this database. Keep the URI server-only.
3. Start the app and open `/api/health/mongodb`. A successful response confirms Atlas connectivity and creates the collections/indexes without deleting data.
4. To import existing records once, either temporarily add the source `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`, or export each table as a JSON array into the ignored `supabase-export/` folder. Run `npm run db:import-supabase`. The import is idempotent and does not delete source records; compare source and destination counts before cutover. Supabase Auth passwords are not imported.
5. Keep the Supabase variables until all application routes are migrated to MongoDB. Remove them only after the runtime cutover is complete.
6. Optionally set `NEXT_PUBLIC_PAYMENT_QR_IMAGE_URL` and server-side `PAYMENT_UPI_ID` to the school's verified QR/payee. The UPI ID is returned to the payment page at runtime so the browser can open a UPI app; it is visible to payment page users. PhonePe is not automatically verified by the app.
7. Set server-only `TEACHER_LOGIN_PASSWORD=786` and a unique random `TEACHER_SESSION_SECRET` in `.env.local`.
8. Run `npm run dev`, then visit the local URL shown by Next.js.
9. For live camera monitoring across mobile networks, configure `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL` in `.env.local` and in the hosting provider's environment settings. TURN URLs may be comma-separated. STUN alone cannot connect every carrier, school Wi-Fi or NAT; use valid TURN credentials from a WebRTC relay provider and redeploy after setting them.

### Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Public publishable key; RLS is mandatory |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server | Legacy public anon key fallback; use only if your project does not provide a publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Reserved for trusted administrative jobs; never use in client code or expose as `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_PAYMENT_QR_IMAGE_URL` | Browser | Optional school-owned QR image shown in student registration |
| `NEXT_PUBLIC_TURN_URL` | Browser | Optional comma-separated TURN relay URLs for WebRTC camera connections |
| `NEXT_PUBLIC_TURN_USERNAME` | Browser | TURN relay username; use provider-issued temporary credentials where available |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | Browser | TURN relay credential; visible to connected clients, so use scoped/rotating credentials |
| `MONGODB_URI` | Server only | MongoDB Atlas connection string; keep it private |
| `MONGODB_DB` | Server only | Database name (defaults to the URI's database if omitted) |
| `PAYMENT_UPI_ID` | Server (returned to payment page) | Optional school UPI payee address used to open the UPI app; visible to payment page users |
| `TEACHER_LOGIN_PASSWORD` | Server only | Shared password used by the approved teachers |
| `TEACHER_SESSION_SECRET` | Server only | Random secret used to sign the teacher login cookie |

## Current implementation

- Student flow: `/student` verifies the student's name, class and roll number against the approved roster, then establishes the existing student session. `/studentdashboard` shows assigned exams and available marks. Selecting an exam opens `/student/payment/:examId`; staff must verify its ₹20 payment before the app opens `/exam/:examId`. `/student/result` shows that student's submitted result.
- MongoDB data model: see `docs/mongodb-data-model.md`. Visit `/api/health/mongodb` once after configuring Atlas to initialize collections and indexes; normal app requests reuse the connection without repeating schema checks.
- Other pages include `/auth/login`, `/auth/callback`, `/teacher/login`, `/teacher`, `/teacher/results`, `/teacher/papers`, `/teacher/sessions`, `/admin` and `/admin/payments`. Legacy registration pages remain available at `/registration/details`, `/registration/exam`, `/registration/payment` and `/registration/demo-result`.
- Middleware protects student/exam routes with the authorized student account check, teacher routes with the signed teacher session or authorized staff account, and payment review with the admin role. The teacher name/password session is restricted to its selected portal mode.
- Back/Forward controls use browser history on portal pages and are hidden during an active exam.

- Supabase email/password sign-in and password recovery.
- Profile role lookup; student accounts use a scoped exam-list RPC.
- Six independent cohort records: Class 8, Class 9, Class 10 Boys, Class 10 Girls, Class 11 and Class 12.
- Server RPCs to start/resume a single student attempt, save choices, record supported focus/visibility warnings and submit/grade once.
- Responsive question-by-question interface, palette, local timer display, exam instructions, progress, result pending state and print stylesheet.
- Supabase RLS rules are enabled for the sensitive core tables; `question_options.is_correct` has no client-select policy. Answer and result writes are limited to trusted database functions.
- Security headers and no demo student data.
- Student registration fields: name, roll number, one of six groups (Class 8/9/10 Boys/10 Girls/11/12), Biology/Physics/Chemistry, chapter name, email/password and payment reference. Registration remains pending until an administrator reviews payment and approves the roster record.
- Exam builder: exam title, subject, chapter, class group, session, start date/time in India time, attempt duration, passing marks, four-option MCQs with one answer key, draft/publish control and optional shared exam for Class 10 Boys/Girls. Published exams open at the scheduled time for 24 hours; students must start within that window, and the per-attempt timer remains in effect. A locked attempt requires an authorized teacher/admin to grant a one-time retry, which remains subject to the same schedule. Sharing requires teacher authorization for both groups.
- Teacher results view includes group-separated class ranks and top-three cards. Admin accounts additionally receive a registration/payment review queue.
- Exam payment offers Cash or Online UPI for the ₹20 fee. Cash uses the signed-in student's name and records the confirmation time; online payment collects the payer name and payment date/time. Submitting either method records a pending payment and enables exam access; an administrator validates the record against received-payment history, updating verified-payment totals.
- Student accounts receive a result lookup styled after the supplied sample (board, class, subject, chapter, name and roll). Sign-in is required and server-side matching restricts results to that student's own published records.
- Teacher paper builder can load the supplied 60-question Class 12 Biology reproduction paper. Its answer key remains in a server-only module and is served only to authorized Class 12 teachers through a private, no-store endpoint.
- Teacher login collects name (Md Arif), password, class, subject and chapter, maps the name to the server-only teacher Auth email, and checks role/class assignment. There is no teacher self-signup.
- Camera preview and live camera streaming have been removed. Teachers can still view a list of active exam sessions without camera feeds.

## Important security and scope notes

- Browser focus/visibility events are imperfect signals. They cannot detect all external activity, block photographs, or guarantee screenshot prevention. Do not claim otherwise; use an approved managed kiosk/lockdown environment if required.
- The browser countdown is a display aid; the database stores a server-generated expiry. A scheduled server-side job should finalize expired attempts that are abandoned before reconnecting.
- Failed answer saves are retried on reconnection while the page remains open; queued answers are not durable across an offline refresh. Test network interruption before production.
- Bulk student/question import, paper editing/deletion, publishing controls for results, and audit-log review UI remain unfinished. Payment references are manually reviewed; a reference is not proof of payment until staff verify it with the school payee.
- Payment submission requires an existing authorized student account whose full name, roll, board and class match. Students can start after submitting payment details; administrators validate payment records separately against received-payment history.
- The app no longer requests or streams camera video. Its active-session view lists exam sessions only.
- The Class 10 boys/girls shared paper uses one `exams` paper plus multiple `exam_group_assignments`; student/attempt records remain distinct. Teacher ranks are computed per `(exam_id, exam_group_id)`, not solely by the shared paper id.
- CSV/Excel and PDF/Word question import, image storage policies, duplicate-session heartbeat, stronger idempotent warning deduplication, retention policies, backup/restore drills, and end-to-end tests remain to be completed.
- Validate the migration and all functions in a disposable Supabase project. Have a qualified security reviewer inspect grants, RLS policies, SQL functions and access flows before production.
- Confirm the Class 12 supplied name/roll/board against the school's authorized record. The names and rolls are confidential student information; restrict repository and database access accordingly.

## Manual test plan before launch

1. Test six group assignments, including identical Class 10 paper ID with separate boys/girls students.
2. Test unauthorized login, role escalation attempts, cross-student result access and cross-group access.
3. Test exam schedule boundaries, unpublished papers, one active attempt, refresh recovery and competing sessions.
4. Test autosave, refresh, network loss/recovery, option tampering and duplicate submit.
5. Test server-side grades for correct, wrong, skipped, negative-mark and passing-threshold cases.
6. Test timer expiry and each warning policy; verify warnings persist after reload and accidental blur/tab events are appropriately debounced.
7. Test withheld results, print output, teacher access scopes, group-separated rankings and ties.
8. Verify student-facing network responses never contain correctness flags or other students' data.
9. Verify all six registration groups, the ₹20 manual payment review and admin approval; test duplicate roll numbers.
10. Test exam creation and editing before attempts begin, exactly four options/one answer, paper mark totals, schedule boundaries, drafts, and independent Class 10 Boys/Girls results and merit positions.
11. Verify Class 12 roster matching, board selection and that result lookup cannot access another student's result.

## Deployment

Deploy the Next.js app on a supported Node hosting platform. Add only the public Supabase URL/key as client environment variables. Keep any service-role secret in a server-only secret store and do not use it in client components. Configure the Supabase Auth redirect URLs, email templates, database backups, log retention and least-privilege staff access for the deployment hostname. Apply reviewed migrations before deploying code that calls their RPC functions.
