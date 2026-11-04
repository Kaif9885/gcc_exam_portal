import { randomInt, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";
import { formatOptionLabel } from "@/lib/format-option-label";
import { CAMERA_TEST_EXAM_ID, ensureCameraTestExam } from "@/lib/server/camera-test-exam";

type Context = { params: Promise<{ examId: string }> };

function shuffledQuestionIds(questions: Array<{ id?: unknown; _id: unknown }>) {
  const ids = questions.map(question => String(question.id ?? question._id));
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

export async function POST(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    const cameraTest = Boolean(student?.test_candidate) && examId === CAMERA_TEST_EXAM_ID;
    let exam = null;
    if (cameraTest) {
      await ensureCameraTestExam(db);
      exam = await db.collection("exams").findOne({ _id: CAMERA_TEST_EXAM_ID, published: true });
    } else if (!student?.test_candidate) {
      const groupAssignment = await db.collection("examGroupAssignments").findOne({ exam_id: examId, exam_group_id: session.groupId });
      exam = groupAssignment ? await db.collection("exams").findOne({ _id: examId, published: true }) : null;
    }
    if (!exam || !student) return NextResponse.json({ error: "This examination is not assigned to this student." }, { status: 404 });
    const studentId = String(student.id ?? student._id);
    if (!student.test_candidate) {
      const payment = await db.collection("examPaymentSubmissions").findOne({
        exam_id: examId,
        student_id: studentId,
        status: { $in: ["verified", "pending"] },
      });
      if (!payment) return NextResponse.json({ error: "Please enter your payment details before exam access." }, { status: 402 });
    }
    const now = new Date();
    if (exam.starts_at && now < new Date(exam.starts_at)) return NextResponse.json({ error: "This exam has not started yet." }, { status: 409 });
    const scheduledEnd = exam.ends_at ? new Date(exam.ends_at) : null;
    if (scheduledEnd && now >= scheduledEnd) return NextResponse.json({ error: "This exam schedule has ended." }, { status: 409 });
    const questions = await db.collection("questions").find({ exam_id: examId }).sort({ position: 1 }).toArray();
    if (!questions.length) return NextResponse.json({ error: "No questions are available for this exam yet." }, { status: 404 });
    const freshQuestionOrder = shuffledQuestionIds(questions);
    const attempts = db.collection("examAttempts");
    let attempt = await attempts.findOne({ exam_id: examId, student_id: studentId });
    let restarted = false;
    if (student.test_candidate && attempt && (attempt.status !== "in_progress" || new Date(attempt.expires_at).getTime() <= now.getTime())) {
      await Promise.all([
        db.collection("studentAnswers").deleteMany({ attempt_id: String(attempt.id ?? attempt._id) }),
        db.collection("results").deleteMany({ exam_id: examId, student_id: studentId }),
        attempts.deleteOne({ _id: attempt._id }),
      ]);
      attempt = null;
      restarted = true;
    }
    if (attempt?.status === "in_progress" && Number(attempt.warning_count ?? 0) >= 3) {
      await attempts.updateOne({ _id: attempt._id, status: "in_progress" }, { $set: { status: "locked" } });
      return NextResponse.json({ error: "This exam attempt is locked after three warnings. It cannot restart from question 1. Ask your administrator for help." }, { status: 403 });
    }
    if (attempt && attempt.status !== "in_progress") {
      if (attempt.status === "locked") {
        return NextResponse.json({ error: "This exam attempt is locked. Ask your teacher or administrator to grant another attempt." }, { status: 403 });
      }
      if (attempt.status !== "retry_allowed") {
        return NextResponse.json({ error: "This examination has already been submitted." }, { status: 409 });
      }
      const durationSeconds = Number(exam.duration_seconds || 2700);
      const restartedAt = new Date();
      const attemptEnd = restartedAt.getTime() + durationSeconds * 1000;
      const expiresAt = new Date(scheduledEnd ? Math.min(attemptEnd, scheduledEnd.getTime()) : attemptEnd);
      const reset = await attempts.updateOne(
        { _id: attempt._id, status: "retry_allowed" },
        {
          $set: {
            status: "in_progress",
            started_at: restartedAt,
            expires_at: expiresAt,
            submitted_at: null,
            session_token: randomUUID(),
            warning_count: 0,
            restarted_at: restartedAt,
            retry_started_at: restartedAt,
            question_order: freshQuestionOrder,
          },
          $unset: { last_focus_warning_at: "", last_focus_warning_event: "" },
        },
      );
      if (reset.matchedCount) {
        await db.collection("studentAnswers").deleteMany({ attempt_id: String(attempt.id ?? attempt._id) });
        attempt = { ...attempt, status: "in_progress", started_at: restartedAt, expires_at: expiresAt, submitted_at: null, warning_count: 0, question_order: freshQuestionOrder };
        restarted = true;
      } else {
        attempt = await attempts.findOne({ _id: attempt._id, status: "in_progress" });
        if (!attempt) return NextResponse.json({ error: "Could not restart this exam. Please try again." }, { status: 409 });
      }
    }
    if (!attempt) {
      const attemptId = `attempt:${randomUUID()}`;
      const durationSeconds = Number(exam.duration_seconds || 2700);
      const attemptEnd = now.getTime() + durationSeconds * 1000;
      const expiresAt = new Date(scheduledEnd ? Math.min(attemptEnd, scheduledEnd.getTime()) : attemptEnd);
      attempt = { _id: attemptId, id: attemptId, exam_id: examId, student_id: studentId, status: "in_progress", started_at: now, expires_at: expiresAt, submitted_at: null, session_token: randomUUID(), warning_count: 0, question_order: freshQuestionOrder, created_at: now };
      await db.collection("examAttempts").insertOne(attempt);
    }
    if (attempt.status === "in_progress" && scheduledEnd && new Date(attempt.expires_at).getTime() > scheduledEnd.getTime()) {
      await attempts.updateOne({ _id: attempt._id, status: "in_progress" }, { $set: { expires_at: scheduledEnd } });
      attempt = { ...attempt, expires_at: scheduledEnd };
    }
    if (!Array.isArray(attempt.question_order)) {
      const legacyOrder = shuffledQuestionIds(questions);
      await attempts.updateOne({ _id: attempt._id, status: "in_progress", $or: [{ question_order: { $exists: false } }, { question_order: null }] }, { $set: { question_order: legacyOrder } });
      attempt = await attempts.findOne({ _id: attempt._id, status: "in_progress" });
      if (!attempt) return NextResponse.json({ error: "This exam attempt is no longer active." }, { status: 409 });
    }
    const questionOrder = attempt.question_order as string[];
    const questionsById = new Map(questions.map(question => [String(question.id ?? question._id), question]));
    const orderedQuestions = questionOrder.map(id => questionsById.get(String(id))).filter((question): question is (typeof questions)[number] => Boolean(question));
    if (orderedQuestions.length !== questions.length) return NextResponse.json({ error: "The saved exam question order is invalid. Please contact your teacher." }, { status: 409 });
    const questionIds = questions.map(question => String(question.id ?? question._id));
    const [options, answers] = await Promise.all([
      db.collection("questionOptions").find({ question_id: { $in: questionIds } }).sort({ option_label: 1, label: 1 }).toArray(),
      db.collection("studentAnswers").find({ attempt_id: String(attempt.id ?? attempt._id) }).toArray(),
    ]);
    const optionsByQuestion = new Map<string, typeof options>();
    for (const option of options) optionsByQuestion.set(String(option.question_id), [...(optionsByQuestion.get(String(option.question_id)) ?? []), option]);
    const answerByQuestion = new Map(answers.map(answer => [String(answer.question_id), answer]));
    const paper = orderedQuestions.map((question, index) => {
      const questionId = String(question.id ?? question._id);
      const answer = answerByQuestion.get(questionId);
      return {
        id: questionId, body: String(question.body), position: index + 1, marks: Number(question.marks || 1),
        options: (optionsByQuestion.get(questionId) ?? []).map((option, index) => {
          return {
            id: String(option.id ?? option._id),
            label: formatOptionLabel(option.option_label || option.label, index),
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
