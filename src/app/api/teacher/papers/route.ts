import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { getAdminSession } from "@/lib/server/admin-session";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  const teacher = getTeacherSession(request);
  const admin = getAdminSession(request);
  if (!teacher && !admin) {
    return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
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
        durationSeconds: Number(exam.duration_seconds ?? 2700),
        maxMarks: Number(exam.max_marks ?? 60),
        passingMarks: Number(exam.passing_marks ?? 20),
        published: Boolean(exam.published),
        resultsPublished: Boolean(exam.results_published ?? true),
        questionCount: questionCountByExam.get(id) ?? 0,
        groups: groupsByExam.get(id) ?? [],
      };
    });

    return NextResponse.json({ papers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Teacher papers fetch failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load examination papers." }, { status: 503 });
  }
}

type OptionInput = { label: string; body: string; is_correct: boolean };
type QuestionInput = { body: string; marks: number; options: OptionInput[] };

// POST /api/teacher/papers — Create a new exam paper with questions
export async function POST(request: NextRequest) {
  const teacher = getTeacherSession(request);
  const admin = getAdminSession(request);
  if (!teacher && !admin) {
    return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
  }

  let body: {
    title: string; subject: string; chapter_name: string; academic_session: string;
    group_slug: string; share_class10: boolean; duration_minutes: number;
    passing_marks: number; publish: boolean; questions: QuestionInput[];
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { title, subject, chapter_name, academic_session, group_slug, share_class10,
          duration_minutes, passing_marks, publish, questions } = body;

  if (!title?.trim() || !subject || !chapter_name?.trim() || !group_slug || !questions?.length) {
    return NextResponse.json({ error: "Missing required fields: title, subject, chapter_name, group_slug, questions." }, { status: 400 });
  }

  for (const q of questions) {
    if (!q.body?.trim()) return NextResponse.json({ error: "Each question must have body text." }, { status: 400 });
    if (!q.options || q.options.length !== 4) return NextResponse.json({ error: "Each question must have exactly 4 options." }, { status: 400 });
    if (!q.options.some(o => o.is_correct)) return NextResponse.json({ error: "Each question must have one correct answer." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();

    // Resolve the group slugs we need to assign this exam to
    const slugsToAssign = [group_slug];
    if (share_class10 && (group_slug === "class-10-boys" || group_slug === "class-10-girls")) {
      const otherSlug = group_slug === "class-10-boys" ? "class-10-girls" : "class-10-boys";
      slugsToAssign.push(otherSlug);
    }

    const groups = await db.collection("examGroups").find({ slug: { $in: slugsToAssign } }).toArray();
    if (!groups.length) {
      return NextResponse.json({ error: `Class group "${group_slug}" not found in the database.` }, { status: 404 });
    }

    const maxMarks = questions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const examId = randomUUID();
    const now = new Date();

    // Insert the exam document
    await db.collection("exams").insertOne({
      id: examId,
      title: title.trim(),
      subject,
      chapter_name: chapter_name.trim(),
      academic_session: (academic_session || "2026-27").trim(),
      duration_seconds: Number(duration_minutes) * 60,
      max_marks: maxMarks,
      passing_marks: Number(passing_marks) || 0,
      published: Boolean(publish),
      results_published: false,
      created_at: now,
      updated_at: now,
      created_by: teacher?.name ?? "teacher",
    });

    // Insert questions + options
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const questionId = randomUUID();
      await db.collection("questions").insertOne({
        id: questionId,
        exam_id: examId,
        position: i + 1,
        body: q.body.trim(),
        marks: Number(q.marks) || 1,
        image_url: null,
        created_at: now,
      });
      for (const opt of q.options) {
        await db.collection("questionOptions").insertOne({
          id: randomUUID(),
          question_id: questionId,
          label: opt.label,
          body: opt.body.trim(),
          is_correct: Boolean(opt.is_correct),
          created_at: now,
        });
      }
    }

    // Assign to group(s)
    for (const group of groups) {
      const groupId = String(group.id ?? group._id);
      await db.collection("examGroupAssignments").insertOne({
        id: randomUUID(),
        exam_id: examId,
        exam_group_id: groupId,
        created_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      examId,
      message: publish
        ? "Question paper created and published to the selected class group(s)."
        : "Question paper saved as a draft. It is not visible to students until published.",
    }, { status: 201 });
  } catch (error) {
    console.error("Paper creation failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not create the examination paper." }, { status: 503 });
  }
}

