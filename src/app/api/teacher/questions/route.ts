import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { getAdminSession } from "@/lib/server/admin-session";

// GET /api/teacher/questions?examId=<id>
export async function GET(request: NextRequest) {
  const teacher = getTeacherSession(request);
  const admin = getAdminSession(request);
  if (!teacher && !admin) {
    return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
  }

  const examId = request.nextUrl.searchParams.get("examId");
  if (!examId) {
    return NextResponse.json({ error: "examId query parameter is required." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();

    const questions = await db
      .collection("questions")
      .find({ exam_id: examId })
      .sort({ position: 1 })
      .toArray();

    if (!questions.length) {
      return NextResponse.json({ questions: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const questionIds = questions.map(q => String(q.id ?? q._id));
    const allOptions = await db
      .collection("questionOptions")
      .find({ question_id: { $in: questionIds } })
      .toArray();

    const optionsByQuestion = new Map<string, { label: string; body: string; is_correct: boolean }[]>();
    for (const opt of allOptions) {
      const qid = String(opt.question_id);
      const list = optionsByQuestion.get(qid) ?? [];
      list.push({ label: String(opt.label), body: String(opt.body), is_correct: Boolean(opt.is_correct) });
      optionsByQuestion.set(qid, list);
    }

    const result = questions.map(q => {
      const id = String(q.id ?? q._id);
      const options = (optionsByQuestion.get(id) ?? []).sort((a, b) => a.label.localeCompare(b.label));
      return {
        id,
        position: Number(q.position ?? 0),
        body: String(q.body ?? ""),
        marks: Number(q.marks ?? 1),
        image_url: q.image_url ? String(q.image_url) : null,
        options,
      };
    });

    return NextResponse.json({ questions: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Teacher questions fetch failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load the question paper." }, { status: 503 });
  }
}

