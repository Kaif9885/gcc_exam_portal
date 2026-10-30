import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

type Context = { params: Promise<{ examId: string }> };

export async function PUT(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  let body: { attemptId?: string; questionId?: string; optionId?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid answer." }, { status: 400 }); }
  if (!body.attemptId || !body.questionId || (body.optionId !== null && typeof body.optionId !== "string")) return NextResponse.json({ error: "Select a valid option." }, { status: 400 });
  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    if (!student) return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    const studentId = String(student.id ?? student._id);
    const attempt = await db.collection("examAttempts").findOne({ _id: body.attemptId, exam_id: examId, student_id: studentId, status: "in_progress" });
    if (!attempt || new Date(attempt.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Exam attempt is expired or no longer active." }, { status: 409 });
    const question = await db.collection("questions").findOne({ _id: body.questionId, exam_id: examId });
    if (!question) return NextResponse.json({ error: "Question does not belong to this exam." }, { status: 400 });
    if (body.optionId) {
      const option = await db.collection("questionOptions").findOne({ _id: body.optionId, question_id: body.questionId });
      if (!option) return NextResponse.json({ error: "Selected option is not valid for this question." }, { status: 400 });
    }
    await db.collection("studentAnswers").updateOne({ attempt_id: body.attemptId, question_id: body.questionId }, {
      $set: { student_id: studentId, option_id: body.optionId ?? null, updated_at: new Date() },
      $setOnInsert: { _id: `${body.attemptId}:${body.questionId}`, attempt_id: body.attemptId, question_id: body.questionId, marked_for_review: false, created_at: new Date() },
    }, { upsert: true });
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Atlas answer save failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not save the answer." }, { status: 503 });
  }
}
