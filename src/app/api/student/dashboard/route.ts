import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

export async function GET(request: NextRequest) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  try {
    const db = await getMongoDb();
    const assignments = await db.collection("examGroupAssignments").find({ exam_group_id: session.groupId }).toArray();
    const examIds = assignments.map(row => String(row.exam_id));
    const exams = examIds.length ? await db.collection("exams").find({ _id: { $in: examIds }, published: true }).toArray() : [];
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    const studentId = student ? String(student.id ?? student._id) : "";
    const [attempts, results] = studentId ? await Promise.all([
      db.collection("examAttempts").find({ student_id: studentId }).toArray(),
      db.collection("results").find({ student_id: studentId }).toArray(),
    ]) : [[], []];
    const attemptByExam = new Map(attempts.map(row => [String(row.exam_id), row]));
    const resultByExam = new Map(results.map(row => [String(row.exam_id), row]));
    const now = Date.now();
    const assignedExams = exams.map(exam => {
      const id = String(exam.id ?? exam._id);
      const attempt = attemptByExam.get(id);
      const result = resultByExam.get(id);
      const startsAt = exam.starts_at ? new Date(exam.starts_at).getTime() : null;
      const endsAt = exam.ends_at ? new Date(exam.ends_at).getTime() : null;
      let status = attempt?.status ?? "available";
      if (!attempt && startsAt !== null && now < startsAt) status = "scheduled";
      if (!attempt && endsAt !== null && now > endsAt) status = "closed";
      return {
        id, title: String(exam.title), subject: String(exam.subject), chapter: String(exam.chapter_name ?? ""),
        durationSeconds: Number(exam.duration_seconds ?? 0), status,
        startsAt: startsAt === null ? null : new Date(startsAt).toISOString(),
        endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
        examDate: exam.starts_at ?? exam.created_at ?? null,
        result: result ? {
          marks: result.marks_obtained, maxMarks: result.max_marks, percentage: result.percentage,
          submittedAt: result.submitted_at ?? attempt?.submitted_at ?? null,
        } : null,
      };
    });
    const resultExamIds = [...new Set(results.map(row => String(row.exam_id)))];
    const resultExamDocs = resultExamIds.length ? await db.collection("exams").find({ _id: { $in: resultExamIds } }).toArray() : [];
    const resultExamById = new Map(resultExamDocs.map(exam => [String(exam.id ?? exam._id), exam]));
    const resultsList = results.flatMap(row => {
      const exam = resultExamById.get(String(row.exam_id));
      if (!exam) return [];
      return [{
        examId: String(row.exam_id), title: String(exam.title), subject: String(exam.subject), chapter: String(exam.chapter_name ?? ""),
        examDate: exam.starts_at ?? row.submitted_at ?? exam.created_at ?? null, submittedAt: row.submitted_at ?? null,
        marks: Number(row.marks_obtained ?? 0), maxMarks: Number(row.max_marks ?? 0), percentage: Number(row.percentage ?? 0),
      }];
    }).sort((left, right) => new Date(right.submittedAt ?? right.examDate ?? 0).getTime() - new Date(left.submittedAt ?? left.examDate ?? 0).getTime());
    return NextResponse.json({ student: { fullName: session.fullName, rollNumber: session.rollNumber, classSlug: session.classSlug, className: session.className, board: session.board }, exams: assignedExams, results: resultsList });
  } catch (error) {
    console.error("MongoDB student dashboard failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not load your dashboard from the school database." }, { status: 503 });
  }
}
