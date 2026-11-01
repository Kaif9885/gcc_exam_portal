import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { EXAM_ACCESS_WINDOW_MS, parseExamStart } from "@/lib/server/exam-schedule";

type Context = { params: Promise<{ examId: string }> };
type OptionInput = { label: string; body: string; is_correct: boolean };
type QuestionInput = { body: string; marks: number; options: OptionInput[] };
type ExamInput = {
  title: string;
  subject: string;
  chapter_name: string;
  academic_session: string;
  group_slug: string;
  share_class10: boolean;
  duration_minutes: number;
  passing_marks: number;
  publish: boolean;
  starts_at: string;
  questions: QuestionInput[];
};

export async function PATCH(request: NextRequest, context: Context) {
  if (!getTeacherSession(request) && !getAdminSession(request)) {
    return NextResponse.json({ error: "Teacher or Admin session required." }, { status: 401 });
  }

  let body: ExamInput;
  try {
    body = await request.json() as ExamInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { title, subject, chapter_name, academic_session, group_slug, share_class10, duration_minutes, passing_marks, publish, starts_at, questions } = body;
  if (!title?.trim() || !subject || !chapter_name?.trim() || !academic_session?.trim() || !group_slug || !Array.isArray(questions) || !questions.length) {
    return NextResponse.json({ error: "Complete all exam details and add at least one question." }, { status: 400 });
  }
  if (!Number.isFinite(duration_minutes) || duration_minutes < 1 || duration_minutes > 300) {
    return NextResponse.json({ error: "Attempt duration must be from 1 to 300 minutes." }, { status: 400 });
  }
  const scheduledStart = parseExamStart(starts_at);
  if (!scheduledStart) return NextResponse.json({ error: "Enter a valid exam start date and time in India time." }, { status: 400 });
  for (const question of questions) {
    if (!question || typeof question.body !== "string" || !question.body.trim() || !Number.isFinite(question.marks) || question.marks <= 0) {
      return NextResponse.json({ error: "Each question needs text and a positive mark value." }, { status: 400 });
    }
    if (
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      question.options.some(option =>
        !option ||
        typeof option.label !== "string" ||
        !["A", "B", "C", "D"].includes(option.label) ||
        typeof option.body !== "string" ||
        !option.body.trim() ||
        typeof option.is_correct !== "boolean"
      ) ||
      new Set(question.options.map(option => option?.label)).size !== 4 ||
      question.options.filter(option => option?.is_correct === true).length !== 1
    ) {
      return NextResponse.json({ error: "Each question needs four filled options and exactly one correct answer." }, { status: 400 });
    }
  }
  const maxMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  if (!Number.isFinite(passing_marks) || passing_marks < 0 || passing_marks > maxMarks) {
    return NextResponse.json({ error: "Passing marks must be between zero and the exam's total marks." }, { status: 400 });
  }
  const slugsToAssign = [group_slug];
  if (share_class10 && (group_slug === "class-10-boys" || group_slug === "class-10-girls")) {
    slugsToAssign.push(group_slug === "class-10-boys" ? "class-10-girls" : "class-10-boys");
  }

  try {
    const { examId } = await context.params;
    const db = await getMongoDb();
    const session = db.client.startSession();
    let result: { kind: "error"; status: number; error: string } | { kind: "success" } | undefined;
    try {
      result = await session.withTransaction(async () => {
        const existing = await db.collection("exams").findOne({ _id: examId }, { session });
        if (!existing) {
          return { kind: "error", status: 404, error: "Exam not found." } as const;
        }
        const attemptsExist = await db.collection("examAttempts").findOne(
          { exam_id: examId },
          { projection: { _id: 1 }, session },
        );
        if (attemptsExist) {
          return { kind: "error", status: 409, error: "This exam cannot be edited after a student has started an attempt." } as const;
        }
        const selectedGroups = await db.collection("examGroups").find({ slug: { $in: slugsToAssign } }, { session }).toArray();
        if (selectedGroups.length !== slugsToAssign.length) {
          return { kind: "error", status: 404, error: "One or more selected class groups could not be found." } as const;
        }

        const now = new Date();
        const scheduledEnd = new Date(scheduledStart.getTime() + EXAM_ACCESS_WINDOW_MS);
        await db.collection("exams").updateOne({ _id: examId }, {
          $set: {
            title: title.trim(),
            subject,
            chapter_name: chapter_name.trim(),
            academic_session: academic_session.trim(),
            duration_seconds: duration_minutes * 60,
            starts_at: scheduledStart,
            ends_at: scheduledEnd,
            max_marks: maxMarks,
            passing_marks,
            published: Boolean(publish),
            updated_at: now,
          },
        }, { session });

        const questionCollection = db.collection("questions");
        const optionCollection = db.collection("questionOptions");
        const oldQuestions = await questionCollection.find({ exam_id: examId }, { projection: { id: 1, _id: 1 }, session }).toArray();
        const oldQuestionIds = oldQuestions.map(question => String(question.id ?? question._id));
        if (oldQuestionIds.length) await optionCollection.deleteMany({ question_id: { $in: oldQuestionIds } }, { session });
        await questionCollection.deleteMany({ exam_id: examId }, { session });

        for (const [index, question] of questions.entries()) {
          const questionId = randomUUID();
          await questionCollection.insertOne({
            _id: questionId,
            id: questionId,
            exam_id: examId,
            position: index + 1,
            body: question.body.trim(),
            marks: question.marks,
            image_url: null,
            created_at: now,
          }, { session });
          for (const option of question.options) {
            const optionId = randomUUID();
            await optionCollection.insertOne({
              _id: optionId,
              id: optionId,
              question_id: questionId,
              option_label: option.label,
              label: option.label,
              body: option.body.trim(),
              is_correct: Boolean(option.is_correct),
              created_at: now,
            }, { session });
          }
        }

        const assignments = db.collection("examGroupAssignments");
        await assignments.deleteMany({ exam_id: examId }, { session });
        await assignments.insertMany(selectedGroups.map(group => {
          const assignmentId = randomUUID();
          return {
            _id: assignmentId,
            id: assignmentId,
            exam_id: examId,
            exam_group_id: String(group.id ?? group._id),
            created_at: now,
          };
        }), { session });
        return { kind: "success" } as const;
      });
    } finally {
      await session.endSession();
    }

    if (result?.kind === "error") return NextResponse.json({ error: result.error }, { status: result.status });
    if (!result) throw new Error("Exam update transaction completed without a result.");
    return NextResponse.json({ success: true, message: publish ? "Exam updated and scheduled." : "Exam updated and saved as a draft." });
  } catch (error) {
    console.error("Exam update failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not update the exam." }, { status: 503 });
  }
}
