import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    const db = await getMongoDb();
    const [attempts, students, exams, groups] = await Promise.all([
      db.collection("examAttempts").find({}).sort({ started_at: -1 }).limit(200).toArray(),
      db.collection("students").find({}).toArray(),
      db.collection("exams").find({}).toArray(),
      db.collection("examGroups").find({}).toArray(),
    ]);

    const studentMap = new Map(students.map(s => [String(s.id ?? s._id), s]));
    const examMap = new Map(exams.map(e => [String(e.id ?? e._id), e]));
    const groupMap = new Map(groups.map(g => [String(g.id ?? g._id), g]));

    const formattedSessions = attempts.map(attempt => {
      const student = studentMap.get(String(attempt.student_id));
      const exam = examMap.get(String(attempt.exam_id));
      const group = student?.exam_group_id ? groupMap.get(String(student.exam_group_id)) : null;
      const expiresAt = new Date(attempt.expires_at || 0).getTime();
      const isExpired = expiresAt > 0 && expiresAt < Date.now();
      const status = attempt.status === "in_progress" && isExpired ? "expired" : attempt.status;

      return {
        id: String(attempt.id ?? attempt._id),
        studentName: String(student?.full_name ?? "Student"),
        testCandidate: Boolean(student?.test_candidate),
        rollNumber: String(student?.roll_number ?? "—"),
        className: String(group?.name ?? "General Class"),
        examTitle: String(exam?.title ?? "Exam"),
        subject: String(exam?.subject ?? "—"),
        status,
        warningCount: Number(attempt.warning_count ?? 0),
        startedAt: attempt.started_at ? new Date(attempt.started_at).toISOString() : new Date().toISOString(),
        expiresAt: attempt.expires_at ? new Date(attempt.expires_at).toISOString() : new Date().toISOString(),
        submittedAt: attempt.submitted_at ? new Date(attempt.submitted_at).toISOString() : null,
      };
    });

    const activeCount = formattedSessions.filter(s => s.status === "in_progress").length;
    const submittedCount = formattedSessions.filter(s => s.status === "submitted").length;

    return NextResponse.json({
      sessions: formattedSessions,
      stats: {
        active: activeCount,
        submitted: submittedCount,
        total: formattedSessions.length,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin sessions fetch failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load active exam sessions." }, { status: 503 });
  }
}

