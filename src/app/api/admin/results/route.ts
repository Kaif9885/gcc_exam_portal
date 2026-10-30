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
    const [rawResults, rawExams, rawStudents, rawGroups] = await Promise.all([
      db.collection("results").find({}).sort({ marks_obtained: -1, submitted_at: 1 }).toArray(),
      db.collection("exams").find({}).toArray(),
      db.collection("students").find({}).toArray(),
      db.collection("examGroups").find({}).sort({ slug: 1 }).toArray(),
    ]);

    const examMap = new Map(rawExams.map(item => [String(item.id ?? item._id), item]));
    const studentMap = new Map(rawStudents.map(item => [String(item.id ?? item._id), item]));
    const groupMap = new Map(rawGroups.map(item => [String(item.id ?? item._id), item]));

    // Group results by exam_id to compute ranks accurately
    const resultsByExam = new Map<string, typeof rawResults>();
    for (const res of rawResults) {
      const examId = String(res.exam_id);
      const list = resultsByExam.get(examId) ?? [];
      list.push(res);
      resultsByExam.set(examId, list);
    }

    const rankMap = new Map<string, number>();
    for (const [, examResults] of resultsByExam.entries()) {
      // Sort descending by marks, then ascending by submission time
      examResults.sort((a, b) => {
        if (Number(b.marks_obtained) !== Number(a.marks_obtained)) {
          return Number(b.marks_obtained) - Number(a.marks_obtained);
        }
        return new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime();
      });
      examResults.forEach((res, index) => {
        rankMap.set(String(res._id ?? res.id), index + 1);
      });
    }

    const formattedResults = rawResults.map(row => {
      const rowId = String(row._id ?? row.id);
      const student = studentMap.get(String(row.student_id));
      const exam = examMap.get(String(row.exam_id));
      const group = student?.exam_group_id ? groupMap.get(String(student.exam_group_id)) : null;

      return {
        id: rowId,
        attemptId: String(row.attempt_id ?? ""),
        studentId: String(row.student_id ?? ""),
        studentName: String(student?.full_name ?? "Student"),
        rollNumber: String(student?.roll_number ?? "—"),
        studentCode: String(student?.student_code ?? "—"),
        examId: String(row.exam_id ?? ""),
        examTitle: String(exam?.title ?? "Examination"),
        subject: String(exam?.subject ?? "—"),
        chapterName: String(exam?.chapter_name ?? "—"),
        classSlug: String(group?.slug ?? "general"),
        className: String(group?.name ?? "General Class"),
        marksObtained: Number(row.marks_obtained ?? 0),
        maxMarks: Number(row.max_marks ?? 0),
        percentage: Number(row.percentage ?? 0),
        correctCount: Number(row.correct_count ?? 0),
        incorrectCount: Number(row.incorrect_count ?? 0),
        unansweredCount: Number(row.unanswered_count ?? 0),
        passed: Boolean(row.passed),
        submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : new Date().toISOString(),
        rank: rankMap.get(rowId) ?? 1,
      };
    });

    const groupsList = rawGroups.map(group => ({
      id: String(group.id ?? group._id),
      slug: String(group.slug),
      name: String(group.name),
    }));

    return NextResponse.json({
      results: formattedResults,
      groups: groupsList,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin results fetch error:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load examination results." }, { status: 503 });
  }
}

