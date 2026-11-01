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
    const [exams, assignments, groups, questions] = await Promise.all([
      db.collection("exams").find({}).sort({ created_at: -1 }).toArray(),
      db.collection("examGroupAssignments").find({}).toArray(),
      db.collection("examGroups").find({}).toArray(),
      db.collection("questions").find({}).toArray(),
    ]);

    const groupMap = new Map(groups.map(g => [String(g.id ?? g._id), g]));
    const groupsByExam = new Map<string, { slug: string; name: string }[]>();
    for (const a of assignments) {
      const examId = String(a.exam_id);
      const group = groupMap.get(String(a.exam_group_id));
      if (group) {
        const list = groupsByExam.get(examId) ?? [];
        list.push({ slug: String(group.slug), name: String(group.name) });
        groupsByExam.set(examId, list);
      }
    }

    const questionCountByExam = new Map<string, number>();
    for (const q of questions) {
      const examId = String(q.exam_id);
      questionCountByExam.set(examId, (questionCountByExam.get(examId) ?? 0) + 1);
    }

    const papers = exams.map(exam => {
      const id = String(exam.id ?? exam._id);
      return {
        id,
        title: String(exam.title ?? "Exam Paper"),
        subject: String(exam.subject ?? "—"),
        chapterName: String(exam.chapter_name ?? "—"),
        academicSession: String(exam.academic_session ?? "2026-27"),
        durationSeconds: Number(exam.duration_seconds ?? 2700),
        maxMarks: Number(exam.max_marks ?? 60),
        passingMarks: Number(exam.passing_marks ?? 20),
        published: Boolean(exam.published),
        startsAt: exam.starts_at ? new Date(exam.starts_at).toISOString() : null,
        endsAt: exam.ends_at ? new Date(exam.ends_at).toISOString() : null,
        resultsPublished: Boolean(exam.results_published ?? true),
        questionCount: questionCountByExam.get(id) ?? 0,
        groups: groupsByExam.get(id) ?? [],
      };
    });

    return NextResponse.json({ papers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin papers fetch failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load examination papers." }, { status: 503 });
  }
}
