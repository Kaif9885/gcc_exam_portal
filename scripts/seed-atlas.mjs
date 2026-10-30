/** Idempotently seeds the school's local rosters, staff and authored paper banks into Atlas. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch { /* Environment may be provided by the shell. */ }
}
loadEnv();

const groups = [
  { slug: "class-8", name: "Class 8" }, { slug: "class-9", name: "Class 9" },
  { slug: "class-10-boys", name: "Class 10 Boys" }, { slug: "class-10-girls", name: "Class 10 Girls" },
  { slug: "class-11", name: "Class 11" }, { slug: "class-12", name: "Class 12" },
];
const rosters = {
  "class-8": ["Krish", "Piyush", "Mausam Singh", "Pooja Kumari", "Roji Khatoon", "Kajal Kumari", "Sidhi Kumari", "Ashraf Alam", "Ragini Kumari", "Md Sohail", "Tanveer Alam", "Prity Kumari", "Anam Parween", "Anushka Kumari", "Babli Kumari", "Md Aayan"],
  "class-9": ["Anish Yadav", "Shaista Parween", "Raunak Parveen", "Karishma Kumari", "Karina Yadav", "Niki Kumari", "Khushi Kumari Sani", "Khushi Kumari", "Ragni Kumari", "Zoya Khan", "Akriti Kumari", "Kaynat", "Anu Kumari", "Prity Kumari 1", "Prity Kumari Pandit", "Sabrin Khatoon", "Neha Khatoon", "Sana Khatoon", "Md Afak Ahmad", "Indrajeet Kr. Mahto", "Sanam Kri", "Yuvraj Kr. Shah", "Vivek Kumar", "Prity Kumari 2", "Mohini Sharma", "Md Sajid", "Ansui Kumari", "Sameer", "Mahvish Nazeer", "Chandan Kumar", "Sabba Parvin", "Zishan", "Mahira Parveen"],
  "class-10-boys": ["Bittu Kumar", "Ankit Kumar", "Nitesh Kumar", "Sumant Kumar", "Vishnujit Kumar", "Parwez Ali", "Umar Azad", "Raiyan Ali", "Sahil Ali", "Himanshu Kushw", "Anshu Kumar", "Samir Khan", "MD Nehal", "Roshan Kumar Gupta"],
  "class-10-girls": ["Shalu Kumari", "Nidhi Kumari", "Noorjannat", "Karishma Kumari", "Dilkash Khatoon", "Sohani Khatoon", "Farina Khatoon", "Juli Parveen", "Shabnam Naj", "Kajal Kumari", "Saniya Siddiqui", "Mahjabin Khatoon", "Farhat Zaha", "Nisha Kumari", "Anjum Khatoon", "Shaheen Parween", "Sufiya Naj", "Sahin Naj", "Sahin Khatoon", "Payal Kumari"],
  "class-11": ["Pawan Kumar", "Reetu Kumari", "Sahina", "Putul Kumari", "Afreen Khatoon", "Rajeev Kumar", "Rukaiya Khatoon", "Nandani Gupta", "Ayesha Khatoon"],
  "class-12": ["Madhu", "Neha Khatoon", "Alisha Khatoon", "Yasmin Parween", "Afreen", "Aasma Parween", "Manisha Kumari", "Sandhya Sah", "Naziya Khan", "Nagma", "Shaista Khatoon", "Vicky Kumar", "Sajeb Ali", "Princy Sharma", "Ravi Kumar", "Shama Khatoon", "Sabbu Khatoon", "Talat Fatma", "Sabbu Khatoon"],
};
const teachers = ["Waseem Akram", "Md Naseem", "Md Meraj", "Tabrej Alam", "Md Arif", "Md Reyaj", "Nisha Kumari", "Nargis Bano", "Er. Faiz"];
const papers = [
  { file: "class8-biology-microbes-paper.ts", exportName: "class8BiologyMicrobesPaper", id: "school-class-8-biology-microbes", title: "Class 8 Biology — Microbes: Friend and Foe", subject: "Biology", chapter: "Microbes: Friend and Foe", slugs: ["class-8"] },
  { file: "class9-physics-motion-paper.ts", exportName: "class9PhysicsMotionPaper", id: "school-class-9-physics-motion", title: "Class 9 Physics — Motion", subject: "Physics", chapter: "Motion", slugs: ["class-9"] },
  { file: "class10-biology-control-coordination-paper.ts", exportName: "class10BiologyControlCoordinationPaper", id: "school-class-10-biology-control-coordination", title: "Class 10 Biology — Control and Coordination", subject: "Biology", chapter: "Control and Coordination", slugs: ["class-10-boys", "class-10-girls"] },
  { file: "class11-biology-classification-paper.ts", exportName: "class11BiologyClassificationPaper", id: "school-class-11-biology-classification", title: "Class 11 Biology — Biological Classification", subject: "Biology", chapter: "Biological Classification", slugs: ["class-11"] },
  { file: "class12-biology-paper.ts", exportName: "class12BiologyReproductionPaper", id: "school-class-12-biology-reproduction", title: "Class 12 Biology — Sexual Reproduction in Flowering Plants", subject: "Biology", chapter: "Sexual Reproduction in Flowering Plants", slugs: ["class-12"] },
];

function loadTypeScriptModule(path) {
  const source = readFileSync(path, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(module.exports, require, module, path, dirname(path));
  return module.exports;
}

function loadPaper(file, exportName) {
  const path = join(root, "src/lib/server", file);
  const module = loadTypeScriptModule(path);
  const paper = module[exportName];
  if (!Array.isArray(paper) || !paper.length) throw new Error(`No questions found in ${file}.`);
  return paper;
}

const uri = process.env.MONGODB_URI;
if (!uri || /<[^>]+>|YOUR_|USERNAME|PASSWORD/i.test(uri)) {
  console.error("MONGODB_URI is missing or still has placeholders. Update .env.local first.");
  process.exit(1);
}

const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "glorious_exams");
  const { ensureMongoSchema } = loadTypeScriptModule(join(root, "src/lib/server/mongo-schema.ts"));
  await ensureMongoSchema(db);

  const groupIds = new Map();
  for (const group of groups) {
    await db.collection("examGroups").updateOne({ slug: group.slug }, { $setOnInsert: { ...group, _id: group.slug, created_at: new Date(), _source: "school-seed" } }, { upsert: true });
    const saved = await db.collection("examGroups").findOne({ slug: group.slug });
    groupIds.set(group.slug, String(saved.id ?? saved._id));
  }

  let rosterCount = 0;
  for (const [slug, names] of Object.entries(rosters)) {
    const groupId = groupIds.get(slug);
    for (let index = 0; index < names.length; index += 1) {
      const fullName = names[index];
      const roll = String(index + 1);
      const existingStudent = await db.collection("students").findOne({ exam_group_id: groupId, roll_number: roll });
      const studentId = String(existingStudent?.id ?? existingStudent?._id ?? `student:${slug}:${roll}`);
      const profileId = String(existingStudent?.profile_id ?? `profile:student:${slug}:${roll}`);
      await db.collection("studentRoster").updateOne({ exam_group_id: groupId, roll_number: roll }, {
        $set: { full_name: fullName, board: "BSEB", authoritative: true },
        $setOnInsert: { _id: `roster:${slug}:${roll}`, exam_group_id: groupId, roll_number: roll, created_at: new Date(), _source: "school-roster" },
      }, { upsert: true });
      await db.collection("profiles").updateOne({ _id: profileId }, { $set: { full_name: fullName, role: "student" }, $setOnInsert: { id: profileId, created_at: new Date(), _source: "school-roster" } }, { upsert: true });
      await db.collection("students").updateOne({ exam_group_id: groupId, roll_number: roll }, {
        $set: { full_name: fullName, active: true },
        $setOnInsert: { _id: studentId, id: studentId, profile_id: profileId, student_code: `${slug}-${roll}`, exam_group_id: groupId, roll_number: roll, created_at: new Date(), _source: "school-roster" },
      }, { upsert: true });
      rosterCount += 1;
    }
  }

  for (const name of teachers) {
    const id = `teacher:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    await db.collection("teacherRoster").updateOne({ full_name: name }, { $set: { full_name: name, active: true }, $setOnInsert: { _id: id, id, created_at: new Date(), _source: "school-roster" } }, { upsert: true });
    const teacher = await db.collection("teacherRoster").findOne({ full_name: name });
    const teacherId = String(teacher.id ?? teacher._id);
    await db.collection("profiles").updateOne({ _id: teacherId }, { $set: { full_name: name, role: "teacher" }, $setOnInsert: { id: teacherId, created_at: new Date(), _source: "school-roster" } }, { upsert: true });
    for (const group of groups) {
      const groupId = groupIds.get(group.slug);
      await db.collection("teacherGroups").updateOne({ teacher_id: teacherId, exam_group_id: groupId }, {
        $setOnInsert: { _id: `${teacherId}:${groupId}`, teacher_id: teacherId, exam_group_id: groupId, created_at: new Date(), _source: "school-roster" },
      }, { upsert: true });
    }
  }

  let questionCount = 0;
  for (const metadata of papers) {
    const questions = loadPaper(metadata.file, metadata.exportName);
    const groupId = groupIds.get(metadata.slugs[0]);
    const now = new Date();
    await db.collection("exams").updateOne({ _id: metadata.id }, { $set: {
      id: metadata.id, title: metadata.title, subject: metadata.subject, chapter_name: metadata.chapter,
      academic_session: "2026-2027", duration_seconds: 2700, max_marks: questions.reduce((sum, q) => sum + q.marks, 0),
      passing_marks: 20, negative_mark: 0,
      published: true, randomize_questions: false, randomize_options: false, warning_policy: "submit", ranking_enabled: true,
      created_by: null, _source: "local-paper-bank",
    }, $setOnInsert: { created_at: now, results_published: false } }, { upsert: true });

    const questionOperations = [];
    const optionOperations = [];
    for (let index = 0; index < questions.length; index += 1) {
      const sourceQuestion = questions[index];
      const questionId = `${metadata.id}:q:${index + 1}`;
      questionOperations.push({ updateOne: { filter: { _id: questionId }, update: { $set: {
        id: questionId, exam_id: metadata.id, body: sourceQuestion.body, marks: sourceQuestion.marks,
        position: index + 1, image_url: null, _source: "local-paper-bank",
      }, $setOnInsert: { created_at: now } }, upsert: true } });
      for (const option of sourceQuestion.options) {
        const optionId = `${questionId}:option:${option.label}`;
        optionOperations.push({ updateOne: { filter: { _id: optionId }, update: { $set: {
          id: optionId, question_id: questionId, option_label: option.label, body: option.body,
          is_correct: Boolean(option.is_correct), _source: "local-paper-bank",
        }, $setOnInsert: { created_at: now } }, upsert: true } });
      }
    }
    if (questionOperations.length) await db.collection("questions").bulkWrite(questionOperations, { ordered: true });
    if (optionOperations.length) await db.collection("questionOptions").bulkWrite(optionOperations, { ordered: true });
    for (const slug of metadata.slugs) {
      const targetGroupId = groupIds.get(slug);
      const assignmentId = `${metadata.id}:${targetGroupId}`;
      await db.collection("examGroupAssignments").updateOne({ exam_id: metadata.id, exam_group_id: targetGroupId }, {
        $setOnInsert: { _id: assignmentId, exam_id: metadata.id, exam_group_id: targetGroupId, created_at: now, _source: "local-paper-bank" },
      }, { upsert: true });
    }
    questionCount += questions.length;
    console.log(`${metadata.title}: ${questions.length} questions imported (draft)`);
  }
  console.log(`Atlas seed complete: ${groups.length} classes, ${rosterCount} student roster entries, ${teachers.length} teachers, ${papers.length} papers, ${questionCount} questions.`);
  console.log("Existing records were upserted; no collections or records were deleted. Seeded papers are published for their assigned classes.");
} catch (error) {
  console.error("Atlas seed failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
