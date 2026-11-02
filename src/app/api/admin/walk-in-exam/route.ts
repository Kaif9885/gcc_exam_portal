import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";
import { createStudentSession, studentSessionCookieName, studentSessionCookieOptions } from "@/lib/server/student-session";

function isExamOpen(exam: { starts_at?: Date | string | null; ends_at?: Date | string | null }, now: Date) {
  const startsAt = exam.starts_at ? new Date(exam.starts_at).getTime() : null;
  const endsAt = exam.ends_at ? new Date(exam.ends_at).getTime() : null;
  return (startsAt === null || now.getTime() >= startsAt) && (endsAt === null || now.getTime() < endsAt);
}

export async function GET(request: NextRequest) {
  if (!getAdminSession(request)) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  try {
    const db = await getMongoDb();
    const now = new Date();
    const [groups, exams, assignments] = await Promise.all([
      db.collection("examGroups").find({}).sort({ slug: 1 }).toArray(),
      db.collection("exams").find({ published: true }).sort({ starts_at: 1, title: 1 }).toArray(),
      db.collection("examGroupAssignments").find({}).toArray(),
    ]);
    const groupMap = new Map(groups.map(group => [String(group.id ?? group._id), group]));
    const examsWithGroups = exams.filter(exam => isExamOpen(exam, now)).map(exam => {
      const examId = String(exam.id ?? exam._id);
      const assignedGroups = assignments
        .filter(assignment => String(assignment.exam_id) === examId)
        .map(assignment => groupMap.get(String(assignment.exam_group_id)))
        .filter((group): group is NonNullable<typeof group> => Boolean(group))
        .map(group => ({ id: String(group.id ?? group._id), slug: String(group.slug), name: String(group.name) }));
      return {
        id: examId,
        title: String(exam.title ?? "Examination"),
        subject: String(exam.subject ?? ""),
        groups: assignedGroups,
      };
    }).filter(exam => exam.groups.length > 0);
    const availableGroups = groups
      .filter(group => examsWithGroups.some(exam => exam.groups.some(assigned => assigned.id === String(group.id ?? group._id))))
      .map(group => ({ id: String(group.id ?? group._id), slug: String(group.slug), name: String(group.name) }));
    return NextResponse.json({ groups: availableGroups, exams: examsWithGroups }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Walk-in exam options failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not load available examinations." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = getAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  let body: { fullName?: string; rollNumber?: string; groupId?: string; examId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the student and exam details." }, { status: 400 }); }
  const fullName = body.fullName?.trim() ?? "";
  const rollNumber = body.rollNumber?.trim() ?? "";
  const groupId = body.groupId?.trim() ?? "";
  const examId = body.examId?.trim() ?? "";
  if (fullName.length < 2 || fullName.length > 120 || !rollNumber || rollNumber.length > 32 || !groupId || !examId) {
    return NextResponse.json({ error: "Enter a valid student name, roll number, class and examination." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const [groups, exam, assignment] = await Promise.all([
      db.collection("examGroups").find({}).toArray(),
      db.collection("exams").findOne({ _id: examId, published: true }),
      db.collection("examGroupAssignments").findOne({ exam_id: examId, exam_group_id: groupId }),
    ]);
    const group = groups.find(item => String(item.id ?? item._id) === groupId) ?? null;
    if (!group || !exam || !assignment || !isExamOpen(exam, new Date())) {
      return NextResponse.json({ error: "This examination is not currently available for the selected class." }, { status: 409 });
    }
    const existingRoster = await db.collection("studentRoster").findOne({ exam_group_id: groupId, roll_number: rollNumber });
    const existingStudent = await db.collection("students").findOne({ exam_group_id: groupId, roll_number: rollNumber });
    if (existingRoster || existingStudent) {
      return NextResponse.json({ error: "This roll number already exists in the selected class. Use the student's existing account." }, { status: 409 });
    }

    const studentId = `walk-in:${randomUUID()}`;
    const studentCode = `WALKIN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const board = String(group.board ?? "BSEB");
    const createdAt = new Date();
    const student = {
      _id: studentId, id: studentId, profile_id: studentId, student_code: studentCode,
      exam_group_id: groupId, full_name: fullName, roll_number: rollNumber, board,
      active: true, created_at: createdAt, created_by: admin.username, walk_in: true,
    };
    try {
      await db.collection("students").insertOne(student);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        return NextResponse.json({ error: "This roll number already exists in the selected class. Use the student's existing account." }, { status: 409 });
      }
      throw error;
    }
    try {
      await db.collection("studentRoster").insertOne({
        _id: studentId, id: studentId, exam_group_id: groupId, roll_number: rollNumber,
        full_name: fullName, board, authoritative: true, created_at: createdAt, created_by: admin.username, walk_in: true,
      });
    } catch (error) {
      await db.collection("students").deleteOne({ _id: studentId });
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        return NextResponse.json({ error: "This roll number already exists in the selected class. Use the student's existing account." }, { status: 409 });
      }
      throw error;
    }

    try {
      await db.collection("auditLogs").insertOne({
        actor_name: admin.name, action: "create_walk_in_student", object_type: "student", object_id: studentId,
        exam_id: examId, exam_group_id: groupId, roll_number: rollNumber, created_at: createdAt,
      });
    } catch (error) {
      console.error("Walk-in student audit log failed:", error instanceof Error ? error.name : "UnknownError");
    }
    const session = createStudentSession({
      fullName, rollNumber, classSlug: String(group.slug), className: String(group.name), groupId, board,
    });
    const response = NextResponse.json({ ok: true, paymentUrl: `/student/payment/${encodeURIComponent(examId)}` });
    response.cookies.set(studentSessionCookieName, session.token, studentSessionCookieOptions(session.maxAge));
    return response;
  } catch (error) {
    console.error("Walk-in student setup failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not prepare this student for the examination." }, { status: 503 });
  }
}
