import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

type Context = { params: Promise<{ examId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const groupAssignment = await db.collection("examGroupAssignments").findOne({ exam_id: examId, exam_group_id: session.groupId });
    const exam = groupAssignment ? await db.collection("exams").findOne({ _id: examId, published: true }) : null;
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    if (!exam || !student) return NextResponse.json({ error: "This examination is not assigned to this student." }, { status: 404 });
    const studentId = String(student.id ?? student._id);
    const payment = await db.collection("examPaymentSubmissions").findOne({
      exam_id: examId,
      student_id: studentId,
      status: { $in: ["verified", "pending"] },
    });
    if (!payment) return NextResponse.json({ error: "Please enter your payment details before exam access." }, { status: 402 });
    if (payment.status === "pending") {
      await db.collection("examPaymentSubmissions").updateOne(
        { _id: payment._id },
        { $set: { status: "verified", reviewed_by: "system_auto", reviewed_at: new Date() } }
      );
    }
    const now = new Date();
    if (exam.starts_at && now < new Date(exam.starts_at)) return NextResponse.json({ error: "This exam has not started yet." }, { status: 409 });
    if (exam.ends_at && now > new Date(exam.ends_at)) return NextResponse.json({ error: "This exam schedule has ended." }, { status: 409 });
    const attempts = db.collection("examAttempts");
    let attempt = await attempts.findOne({ exam_id: examId, student_id: studentId });
    let restarted = false;
    if (attempt && attempt.status !== "in_progress") {
      if (attempt.status !== "locked") {
        return NextResponse.json({ error: "This examination has already been submitted." }, { status: 409 });
      }
      const durationSeconds = Number(exam.duration_seconds || 2700);
      const restartedAt = new Date();
      const expiresAt = new Date(restartedAt.getTime() + durationSeconds * 1000);
      const reset = await attempts.updateOne(
        { _id: attempt._id, status: "locked" },
        {
          $set: {
            status: "in_progress",
            started_at: restartedAt,
            expires_at: expiresAt,
            submitted_at: null,
            session_token: randomUUID(),
            warning_count: 0,
            restarted_at: restartedAt,
          },
          $unset: { last_focus_warning_at: "", last_focus_warning_event: "" },
        },
      );
      if (reset.matchedCount) {
        await db.collection("studentAnswers").deleteMany({ attempt_id: String(attempt.id ?? attempt._id) });
        attempt = { ...attempt, status: "in_progress", started_at: restartedAt, expires_at: expiresAt, submitted_at: null, warning_count: 0 };
        restarted = true;
      } else {
        attempt = await attempts.findOne({ _id: attempt._id, status: "in_progress" });
        if (!attempt) return NextResponse.json({ error: "Could not restart this exam. Please try again." }, { status: 409 });
      }
    }
    if (!attempt) {
      const attemptId = `attempt:${randomUUID()}`;
      const durationSeconds = Number(exam.duration_seconds || 2700);
      const expiresAt = new Date(now.getTime() + durationSeconds * 1000);
      attempt = { _id: attemptId, id: attemptId, exam_id: examId, student_id: studentId, status: "in_progress", started_at: now, expires_at: expiresAt, submitted_at: null, session_token: randomUUID(), warning_count: 0, created_at: now };
      await db.collection("examAttempts").insertOne(attempt);
    }
    const questions = await db.collection("questions").find({ exam_id: examId }).sort({ position: 1 }).toArray();
    if (!questions.length) return NextResponse.json({ error: "No questions are available for this exam yet." }, { status: 404 });
    const questionIds = questions.map(question => String(question.id ?? question._id));
    const [options, answers] = await Promise.all([
      db.collection("questionOptions").find({ question_id: { $in: questionIds } }).sort({ option_label: 1, label: 1 }).toArray(),
      db.collection("studentAnswers").find({ attempt_id: String(attempt.id ?? attempt._id) }).toArray(),
    ]);
    const optionsByQuestion = new Map<string, typeof options>();
    for (const option of options) optionsByQuestion.set(String(option.question_id), [...(optionsByQuestion.get(String(option.question_id)) ?? []), option]);
    const answerByQuestion = new Map(answers.map(answer => [String(answer.question_id), answer]));
    const paper = questions.map(question => {
      const questionId = String(question.id ?? question._id);
      const answer = answerByQuestion.get(questionId);
      return {
        id: questionId, body: String(question.body), position: Number(question.position), marks: Number(question.marks || 1),
        options: (optionsByQuestion.get(questionId) ?? []).map((option, index) => {
          const storedLabel = option.option_label ?? option.label;
          const cleanLabel = typeof storedLabel === "string" ? storedLabel.trim() : "";
          return {
            id: String(option.id ?? option._id),
            label: cleanLabel && cleanLabel.toLowerCase() !== "undefined" ? cleanLabel : String.fromCharCode(65 + index),
            body: String(option.body ?? ""),
          };
        }),
        selectedOptionId: answer?.option_id ? String(answer.option_id) : null,
      };
    });
    return NextResponse.json({ restarted, student: { fullName: session.fullName, rollNumber: session.rollNumber }, attempt: { id: String(attempt.id ?? attempt._id), expiresAt: new Date(attempt.expires_at).toISOString(), startedAt: new Date(attempt.started_at).toISOString(), warningCount: Number(attempt.warning_count ?? 0) }, exam: { id: examId, title: exam.title, durationSeconds: exam.duration_seconds, subject: exam.subject }, questions: paper }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Atlas exam start failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not start this exam. Please try again shortly." }, { status: 503 });
  }
}
