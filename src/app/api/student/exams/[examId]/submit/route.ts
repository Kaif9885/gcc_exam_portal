import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

type Context = { params: Promise<{ examId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  let body: { attemptId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid exam submission." }, { status: 400 }); }
  if (!body.attemptId) return NextResponse.json({ error: "Exam attempt is missing." }, { status: 400 });
  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    if (!student) return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    const studentId = String(student.id ?? student._id);
    const attemptId = body.attemptId;
    const attempt = await db.collection("examAttempts").findOne({ _id: attemptId, exam_id: examId, student_id: studentId });
    if (!attempt) return NextResponse.json({ error: "Exam attempt not found." }, { status: 404 });
    const previous = await db.collection("results").findOne({ exam_id: examId, student_id: studentId });
    if (attempt.status === "submitted" && previous) return NextResponse.json({ result: previous });
    if (attempt.status !== "in_progress") return NextResponse.json({ error: "This exam attempt is no longer active." }, { status: 409 });
    const questions = await db.collection("questions").find({ exam_id: examId }).sort({ position: 1 }).toArray();
    const answers = await db.collection("studentAnswers").find({ attempt_id: attemptId }).toArray();
    const selected = new Map(answers.filter(answer => answer.option_id).map(answer => [String(answer.question_id), String(answer.option_id)]));
    let marks = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    const review = [];
    for (const question of questions) {
      const questionId = String(question.id ?? question._id);
      const selectedId = selected.get(questionId) ?? null;
      const selectedOption = selectedId ? await db.collection("questionOptions").findOne({ _id: selectedId, question_id: questionId }) : null;
      const correctOption = await db.collection("questionOptions").findOne({ question_id: questionId, is_correct: true });
      const isCorrect = Boolean(selectedOption && correctOption && String(selectedOption._id) === String(correctOption._id));
      const questionMarks = Number(question.marks || 1);
      if (isCorrect) { marks += questionMarks; correctCount += 1; }
      else if (selectedOption) incorrectCount += 1;
      review.push({ questionId, selectedOptionId: selectedId, correctOptionId: correctOption ? String(correctOption._id) : null, isCorrect, marks: isCorrect ? questionMarks : 0 });
    }
    const maxMarks = Number(questions.reduce((sum, question) => sum + Number(question.marks || 1), 0));
    const unansweredCount = Math.max(0, questions.length - selected.size);
    const submittedAt = new Date();
    const resultId = `result:${examId}:${studentId}`;
    const result = {
      _id: resultId, id: resultId, attempt_id: attemptId, exam_id: examId, student_id: studentId,
      correct_count: correctCount, incorrect_count: incorrectCount, unanswered_count: unansweredCount,
      marks_obtained: marks, max_marks: maxMarks, percentage: maxMarks ? Math.round(marks / maxMarks * 10000) / 100 : 0,
      passed: marks >= Number((await db.collection("exams").findOne({ _id: examId }))?.passing_marks ?? 0), submitted_at: submittedAt,
      answer_review: review, created_at: submittedAt,
    };
    const { _id: resultDocumentId, ...resultFields } = result;
    await db.collection("results").updateOne({ exam_id: examId, student_id: studentId }, { $set: resultFields, $setOnInsert: { _id: resultDocumentId } }, { upsert: true });
    await db.collection("examAttempts").updateOne({ _id: attemptId }, { $set: { status: "submitted", submitted_at: submittedAt } });
    return NextResponse.json({ result: { examId, marks: result.marks_obtained, maxMarks, percentage: result.percentage, correctCount, incorrectCount, unansweredCount, submittedAt: submittedAt.toISOString(), answerReview: review } });
  } catch (error) {
    console.error("Atlas exam submission failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not submit the exam." }, { status: 503 });
  }
}
