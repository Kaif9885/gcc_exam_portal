import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

type Context = { params: Promise<{ examId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });

  let body: { attemptId?: string; event?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid exam warning." }, { status: 400 }); }
  if (!body.attemptId || !["visibility_hidden", "window_blur"].includes(body.event ?? "")) {
    return NextResponse.json({ error: "Invalid exam warning." }, { status: 400 });
  }

  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
    if (!student) return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    const studentId = String(student.id ?? student._id);
    const attempts = db.collection("examAttempts");
    const attempt = await attempts.findOne({ _id: body.attemptId, exam_id: examId, student_id: studentId });
    if (!attempt) return NextResponse.json({ error: "Exam attempt not found." }, { status: 404 });
    const warningCount = Number(attempt.warning_count ?? 0);
    if (attempt.status === "locked") return NextResponse.json({ warningCount, shouldLogout: true });
    if (attempt.status !== "in_progress" || new Date(attempt.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Exam attempt is no longer active." }, { status: 409 });
    }

    const now = new Date();
    const lastWarningAt = attempt.last_focus_warning_at ? new Date(attempt.last_focus_warning_at).getTime() : 0;
    if (now.getTime() - lastWarningAt < 1800) return NextResponse.json({ warningCount, shouldLogout: false, duplicate: true });

    const nextWarningCount = warningCount + 1;
    const expectedCount = attempt.warning_count === undefined
      ? { warning_count: { $exists: false } }
      : { warning_count: attempt.warning_count };
    const update = await attempts.updateOne(
      { _id: attempt._id, status: "in_progress", ...expectedCount },
      {
        $set: {
          warning_count: nextWarningCount,
          last_focus_warning_at: now,
          last_focus_warning_event: body.event,
        },
      },
    );
    if (!update.matchedCount) return NextResponse.json({ error: "The exam attempt changed. Reload to check its status." }, { status: 409 });
    return NextResponse.json({ warningCount: nextWarningCount, shouldLogout: nextWarningCount >= 4 });
  } catch (error) {
    console.error("Exam focus warning failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not record the exam-screen departure." }, { status: 503 });
  }
}
