import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";

export async function POST(request: NextRequest) {
  const admin = getAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  let body: { fullName?: string; rollNumber?: string; groupId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter test student name, class and roll number." }, { status: 400 }); }
  const fullName = body.fullName?.trim() ?? "";
  const rollNumber = body.rollNumber?.trim() ?? "";
  const groupId = body.groupId?.trim() ?? "";
  if (fullName.length < 2 || fullName.length > 120 || !rollNumber || rollNumber.length > 32 || !groupId) {
    return NextResponse.json({ error: "Enter a valid test student name, class and roll number." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const groups = await db.collection("examGroups").find({}).toArray();
    const group = groups.find(item => String(item.id ?? item._id) === groupId) ?? null;
    if (!group) return NextResponse.json({ error: "Selected class was not found." }, { status: 404 });
    const groupIdValue = String(group.id ?? group._id);
    const [existingStudent, existingRoster] = await Promise.all([
      db.collection("students").findOne({ exam_group_id: groupIdValue, roll_number: rollNumber }),
      db.collection("studentRoster").findOne({ exam_group_id: groupIdValue, roll_number: rollNumber }),
    ]);
    if (existingStudent || existingRoster) {
      if (existingStudent?.test_candidate && String(existingStudent.full_name).trim().toLowerCase() === fullName.toLowerCase()) {
        return NextResponse.json({ ok: true, existing: true, student: { fullName: String(existingStudent.full_name), rollNumber, className: String(group.name), classSlug: String(group.slug), studentCode: String(existingStudent.student_code) } });
      }
      return NextResponse.json({ error: "This class and roll number already belong to another student." }, { status: 409 });
    }

    const studentId = `test-student:${randomUUID()}`;
    const studentCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const board = String(group.board ?? "BSEB");
    const createdAt = new Date();
    const fields = {
      exam_group_id: groupIdValue, roll_number: rollNumber, full_name: fullName, board,
      authoritative: true, test_candidate: true, created_at: createdAt, created_by: admin.username,
    };
    await db.collection("students").insertOne({
      _id: studentId, id: studentId, profile_id: studentId, student_code: studentCode,
      ...fields, active: true,
    });
    try {
      await db.collection("studentRoster").insertOne({ _id: studentId, id: studentId, ...fields });
    } catch (error) {
      await db.collection("students").deleteOne({ _id: studentId });
      throw error;
    }
    await db.collection("auditLogs").insertOne({
      actor_name: admin.name, action: "create_test_student", object_type: "student", object_id: studentId,
      exam_group_id: groupIdValue, roll_number: rollNumber, created_at: createdAt,
    }).catch(error => console.error("Test student audit log failed:", error instanceof Error ? error.name : "UnknownError"));
    return NextResponse.json({ ok: true, existing: false, student: { fullName, rollNumber, className: String(group.name), classSlug: String(group.slug), studentCode } }, { status: 201 });
  } catch (error) {
    console.error("Test student creation failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not create the test student." }, { status: 503 });
  }
}
