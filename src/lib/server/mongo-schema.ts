import type { Db, IndexDescription } from "mongodb";

const indexes: Record<string, IndexDescription[]> = {
  examGroups: [{ key: { slug: 1 }, unique: true }, { key: { name: 1 }, unique: true }],
  profiles: [{ key: { role: 1, full_name: 1 } }],
  studentRoster: [{ key: { exam_group_id: 1, roll_number: 1 }, unique: true }, { key: { authoritative: 1, exam_group_id: 1 } }],
  students: [{ key: { profile_id: 1 }, unique: true }, { key: { exam_group_id: 1, roll_number: 1 }, unique: true }, { key: { student_code: 1 }, unique: true }],
  teacherRoster: [{ key: { full_name: 1 }, unique: true }],
  teacherGroups: [{ key: { teacher_id: 1, exam_group_id: 1 }, unique: true }],
  registrationRequests: [{ key: { profile_id: 1 }, unique: true }, { key: { review_status: 1, payment_status: 1, created_at: -1 } }],
  exams: [{ key: { published: 1, starts_at: 1, ends_at: 1 } }, { key: { chapter_name: 1, subject: 1 } }],
  examGroupAssignments: [{ key: { exam_id: 1, exam_group_id: 1 }, unique: true }, { key: { exam_group_id: 1 } }],
  questions: [{ key: { exam_id: 1, position: 1 }, unique: true }],
  questionOptions: [{ key: { question_id: 1, option_label: 1 }, unique: true }],
  examAttempts: [{ key: { exam_id: 1, student_id: 1 }, unique: true }, { key: { exam_id: 1, status: 1 } }, { key: { student_id: 1, status: 1 } }],
  studentAnswers: [{ key: { attempt_id: 1, question_id: 1 }, unique: true }],
  examWarnings: [{ key: { attempt_id: 1, count_after: 1 }, unique: true }],
  examVideoParticipants: [{ key: { attempt_id: 1, participant_id: 1 }, unique: true }, { key: { attempt_id: 1, last_seen: 1 } }],
  examVideoSignals: [{ key: { attempt_id: 1, to_id: 1, _id: 1 } }, { key: { created_at: 1 } }],
  results: [{ key: { exam_id: 1, student_id: 1 }, unique: true }, { key: { exam_id: 1, marks_obtained: -1, submitted_at: 1 } }, { key: { student_id: 1, submitted_at: -1 } }],
  examPaymentSubmissions: [{ key: { status_token: 1 }, unique: true }, { key: { status: 1, created_at: -1 } }, { key: { exam_group_id: 1, roll_number: 1, subject: 1, chapter_name: 1 } }, { key: { student_id: 1, exam_id: 1, created_at: -1 } }],
  auditLogs: [{ key: { actor_id: 1, created_at: -1 } }, { key: { object_type: 1, object_id: 1 } }],
};

/** Creates the application's collections and indexes without modifying stored records. */
export async function ensureMongoSchema(db: Db) {
  try {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name));
    for (const [name, collectionIndexes] of Object.entries(indexes)) {
      if (!existing.has(name)) {
        try { await db.createCollection(name); } catch { /* ignore if already exists */ }
      }
      for (const index of collectionIndexes) {
        try {
          await db.collection(name).createIndex(index.key, { unique: index.unique ?? false });
        } catch { /* ignore if index already exists with different options */ }
      }
    }
  } catch (error) {
    console.warn("MongoDB schema check warning (proceeding):", error);
  }
}
