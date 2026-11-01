import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";
import { getTeacherSession } from "@/lib/server/teacher-session";

type Context = { params: Promise<{ attemptId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const admin = getAdminSession(request);
  const teacher = getTeacherSession(request);
  if (!admin && !teacher) {
    return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const db = await getMongoDb();
    const attempts = db.collection("examAttempts");
    const attempt = await attempts.findOne({ $or: [{ _id: attemptId }, { id: attemptId }] });
    if (!attempt) return NextResponse.json({ error: "Exam attempt not found." }, { status: 404 });
    if (attempt.status !== "locked") {
      return NextResponse.json({ error: "Only a locked exam attempt can be granted another attempt." }, { status: 409 });
    }

    const exam = await db.collection("exams").findOne({ _id: String(attempt.exam_id) });
    if (!exam) return NextResponse.json({ error: "The exam for this attempt could not be found." }, { status: 404 });
    const now = new Date();
    if (exam.starts_at && now < new Date(exam.starts_at)) {
      return NextResponse.json({ error: "This exam has not started yet." }, { status: 409 });
    }
    if (exam.ends_at && now >= new Date(exam.ends_at)) {
      return NextResponse.json({ error: "The exam access window has ended; another attempt cannot be granted now." }, { status: 409 });
    }

    const actor = admin
      ? { name: admin.name, role: "admin" }
      : teacher
        ? { name: teacher.name, role: "teacher" }
        : null;
    if (!actor) return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
    const result = await attempts.updateOne(
      { _id: attempt._id, status: "locked" },
      {
        $set: {
          status: "retry_allowed",
          retry_granted_at: now,
          retry_granted_by: actor.name,
          retry_granted_by_role: actor.role,
        },
        $inc: { retry_grant_count: 1 },
      },
    );
    if (!result.matchedCount) {
      return NextResponse.json({ error: "This attempt changed before the grant could be applied. Refresh and try again." }, { status: 409 });
    }

    return NextResponse.json({ message: "One more attempt has been granted. The student can start it before the exam access window closes." });
  } catch (error) {
    console.error("Exam retry grant failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not grant another exam attempt." }, { status: 503 });
  }
}
