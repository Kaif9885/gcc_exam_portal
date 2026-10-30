/**
 * One-time import to Atlas from either Supabase REST or JSON table exports.
 * The application itself can use MongoDB at runtime; source credentials are migration-only.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";

function loadEnv(path = ".env.local") {
  let contents;
  try { contents = readFileSync(path, "utf8"); } catch { return; }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnv();

const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || "glorious_exams";
const jsonDir = process.env.MIGRATION_JSON_DIR || "supabase-export";
const useJson = existsSync(join(jsonDir, "exam_groups.json"));
if ((!useJson && (!sourceUrl || !serviceKey || /YOUR_|GENERATE_/.test(`${sourceUrl} ${serviceKey}`))) || !mongoUri || /YOUR_|GENERATE_/.test(mongoUri)) {
  console.error("Migration needs a real MONGODB_URI and either Supabase source credentials or JSON table exports in the source directory.");
  process.exit(1);
}

const tables = [
  ["exam_groups", "examGroups", "id"],
  ["profiles", "profiles", "id"],
  ["student_roster", "studentRoster", "id"],
  ["students", "students", "id"],
  ["teacher_roster", "teacherRoster", "id"],
  ["teacher_groups", "teacherGroups", ["teacher_id", "exam_group_id"]],
  ["registration_requests", "registrationRequests", "profile_id"],
  ["exams", "exams", "id"],
  ["exam_group_assignments", "examGroupAssignments", ["exam_id", "exam_group_id"]],
  ["questions", "questions", "id"],
  ["question_options", "questionOptions", "id"],
  ["exam_attempts", "examAttempts", "id"],
  ["student_answers", "studentAnswers", ["attempt_id", "question_id"]],
  ["exam_warnings", "examWarnings", "id"],
  ["results", "results", "attempt_id"],
  ["exam_payment_submissions", "examPaymentSubmissions", "id"],
  ["audit_logs", "auditLogs", "id"],
];

async function fetchTable(table) {
  if (useJson) {
    const path = join(jsonDir, `${table}.json`);
    if (!existsSync(path)) throw new Error(`Missing ${path}. Export every table listed in docs/mongodb-data-model.md before importing.`);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${path} must contain a JSON array of table rows.`);
    return parsed;
  }
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${sourceUrl}/rest/v1/${table}?select=*`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Range: `${offset}-${offset + pageSize - 1}`, "Range-Unit": "items" },
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error(`Source table ${table} was not found. Confirm that the reviewed Supabase migrations have been applied.`);
      throw new Error(`Could not read source table ${table} (HTTP ${response.status}). Check the source credentials and table grants.`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error(`Unexpected response while reading ${table}.`);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function documentId(row, key) {
  if (Array.isArray(key)) return key.map(field => String(row[field] ?? "")).join(":");
  return String(row[key] ?? "");
}

function normalizeDates(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "string" && /(?:_at|_on|_until)$/.test(key) && !Number.isNaN(Date.parse(value)) ? new Date(value) : value,
  ]));
}

const indexes = {
  examGroups: [[{ slug: 1 }, { unique: true }], [{ name: 1 }, { unique: true }]],
  profiles: [[{ role: 1, full_name: 1 }, {}]],
  studentRoster: [[{ exam_group_id: 1, roll_number: 1 }, { unique: true }], [{ authoritative: 1, exam_group_id: 1 }, {}]],
  students: [[{ profile_id: 1 }, { unique: true }], [{ exam_group_id: 1, roll_number: 1 }, { unique: true }], [{ student_code: 1 }, { unique: true }]],
  teacherRoster: [[{ full_name: 1 }, { unique: true }]],
  teacherGroups: [[{ teacher_id: 1, exam_group_id: 1 }, { unique: true }]],
  registrationRequests: [[{ profile_id: 1 }, { unique: true }], [{ review_status: 1, payment_status: 1, created_at: -1 }, {}]],
  exams: [[{ published: 1, starts_at: 1, ends_at: 1 }, {}], [{ chapter_name: 1, subject: 1 }, {}]],
  examGroupAssignments: [[{ exam_id: 1, exam_group_id: 1 }, { unique: true }], [{ exam_group_id: 1 }, {}]],
  questions: [[{ exam_id: 1, position: 1 }, { unique: true }]],
  questionOptions: [[{ question_id: 1, option_label: 1 }, { unique: true }]],
  examAttempts: [[{ exam_id: 1, student_id: 1 }, { unique: true }], [{ exam_id: 1, status: 1 }, {}]],
  studentAnswers: [[{ attempt_id: 1, question_id: 1 }, { unique: true }]],
  examWarnings: [[{ attempt_id: 1, count_after: 1 }, { unique: true }]],
  results: [[{ exam_id: 1, student_id: 1 }, { unique: true }], [{ exam_id: 1, marks_obtained: -1, submitted_at: 1 }, {}]],
  examPaymentSubmissions: [[{ status_token: 1 }, { unique: true }], [{ status: 1, created_at: -1 }, {}], [{ exam_group_id: 1, roll_number: 1, subject: 1, chapter_name: 1 }, {}]],
  auditLogs: [[{ actor_id: 1, created_at: -1 }, {}], [{ object_type: 1, object_id: 1 }, {}]],
};

const client = new MongoClient(mongoUri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(databaseName);
  console.log(`Connected to target database '${databaseName}'.`);
  for (const [table, collectionName, key] of tables) {
    const rows = await fetchTable(table);
    const collection = db.collection(collectionName);
    if (rows.length) {
      const operations = rows.map(row => {
        const id = documentId(row, key);
        if (!id) throw new Error(`A row in ${table} has no migration key; stopping before importing that collection.`);
        return { replaceOne: { filter: { _id: id }, replacement: { ...normalizeDates(row), _id: id, _source: "supabase", _migratedAt: new Date() }, upsert: true } };
      });
      for (let start = 0; start < operations.length; start += 500) {
        await collection.bulkWrite(operations.slice(start, start + 500), { ordered: true });
      }
    }
    console.log(`${table} -> ${collectionName}: ${rows.length} rows`);
  }
  for (const [collectionName, definitions] of Object.entries(indexes)) {
    const collection = db.collection(collectionName);
    for (const [key, options] of definitions) await collection.createIndex(key, options);
  }
  const classGroups = [["class-8", "Class 8"], ["class-9", "Class 9"], ["class-10-boys", "Class 10 Boys"], ["class-10-girls", "Class 10 Girls"], ["class-11", "Class 11"], ["class-12", "Class 12"]];
  for (const [slug, name] of classGroups) {
    await db.collection("examGroups").updateOne({ slug }, { $setOnInsert: { _id: slug, slug, name, _source: "application", created_at: new Date() } }, { upsert: true });
  }
  console.log("Import finished. Source records were read only. Review collection counts and sample records before switching the application.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
} finally {
  await client.close();
}
