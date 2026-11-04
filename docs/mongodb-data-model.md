# MongoDB Atlas data model

The application database is `glorious_exams` (configurable with `MONGODB_DB`). Each SQL row is represented as one MongoDB document. Existing UUIDs are preserved as string `_id` values during migration, and foreign-key fields remain UUID strings so relationships and historical records remain traceable.

For local development and the live deployment to share one database, set the exact same server-only `MONGODB_URI` and `MONGODB_DB` values in `.env.local` and the live host's encrypted environment variables. Both instances will then read and write the same Atlas records; local code does not create a separate database unless `MONGODB_DB` differs. Never use a `NEXT_PUBLIC_` variable for the URI.

| Collection | Purpose |
| --- | --- |
| `profiles` | Student, teacher and administrator names/roles. Supabase password hashes are not copied. |
| `examGroups` | The six class/cohort records. |
| `studentRoster` | Approved name, roll, board and class access list. |
| `students` | Active student enrollment and profile linkage. |
| `teacherRoster`, `teacherGroups` | Approved staff and class permissions. |
| `registrationRequests` | Enrollment and initial fee review records. |
| `exams`, `examGroupAssignments` | Exam settings, schedule, publication state and class assignment. |
| `questions`, `questionOptions` | Question content and private answer-key flags. Never return correctness flags from student APIs. |
| `examAttempts`, `studentAnswers`, `examWarnings` | Attempt lifecycle, saved choices, timers/session tokens and focus warnings. |
| `examVideoParticipants`, `examVideoSignals` | Short-lived presence and private WebRTC signaling for an active exam attempt; consenting student video is sent to authorized teachers, who may send microphone audio back. Media is peer-to-peer and is not stored by the app. |
| `results` | Graded outcomes and marks, constrained to student ownership in APIs. |
| `examPaymentSubmissions` | ₹20 claims, payer details and staff review state. A claim alone never grants access. |
| `auditLogs` | Administrative and exam activity history. |

`ensureMongoSchema()` creates collections and indexes only; it does not seed records. Run `/api/health/mongodb` once after configuring Atlas to initialize the schema, then run `npm run db:seed` to idempotently insert the local school catalog: six classes, the supplied student rosters, approved teacher names, and the five authored question banks. Normal page/API requests connect to the initialized schema without repeating the index checks. Student answers are stored separately from option records, and the correct-option flag is kept server-side in `questionOptions`. Local school papers are published when seeded and assigned to their configured class groups.

Historical records such as payment submissions, past attempts, answers and results are not present in the local source files. To move those, export every SQL table as a JSON array into the ignored `supabase-export/` folder, then run `npm run db:import-supabase` once before `npm run db:seed`. The importer preserves source row IDs and relationships and does not delete its source. It needs a complete export; see the table list in `scripts/migrate-supabase-to-mongodb.mjs`. If there is no source export, those old records cannot be reconstructed from the authored paper files or student roster.

The migration does not copy Supabase Auth credentials. Student access is based on the approved roster; legacy email/password accounts must be replaced with the application's own server-side session flow. Keep the Atlas URI server-only and enable Atlas network access for only trusted hosts. Runtime endpoints still need to be migrated individually before the application is fully independent of Supabase; importing data alone does not switch those reads and writes.
