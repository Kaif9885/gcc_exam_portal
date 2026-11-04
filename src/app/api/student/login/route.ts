import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { createStudentSession, studentSessionCookieName, studentSessionCookieOptions } from "@/lib/server/student-session";

const classes = new Set(["class-8", "class-9", "class-10-boys", "class-10-girls", "class-11", "class-12"]);

export async function POST(request: NextRequest) {
  let body: { fullName?: string; rollNumber?: string; classSlug?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your name, class and roll number." }, { status: 400 }); }

  const fullName = body.fullName?.trim() ?? "";
  const rollNumber = body.rollNumber?.trim() ?? "";
  const classSlug = body.classSlug ?? "";
  if (fullName.length < 2 || fullName.length > 120 || !rollNumber || rollNumber.length > 32 || !classes.has(classSlug)) {
    return NextResponse.json({ error: "Enter a valid name, class and roll number." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const group = await db.collection("examGroups").findOne({ slug: classSlug });
    if (!group) return NextResponse.json({ error: "The selected class is currently unavailable. Please try again shortly." }, { status: 503 });
    const groupId = String(group.id ?? group._id);
    const normalRoster = await db.collection("studentRoster").findOne({ exam_group_id: groupId, roll_number: rollNumber });
    const normalStudent = await db.collection("students").findOne({ exam_group_id: groupId, roll_number: rollNumber });
    let isTestCandidate = false;
    let roster = normalRoster;
    let student = normalStudent;
    let resolvedGroupId = groupId;
    let resolvedClassSlug = classSlug;
    let resolvedClassName = String(group.name);
    const resolvedBoard = String(group.board ?? "BSEB");

    const exactRosterMatch = normalRoster?.authoritative && String(normalRoster.full_name).trim().toLocaleLowerCase() === fullName.toLocaleLowerCase();
    if (exactRosterMatch) {
      isTestCandidate = Boolean(normalRoster.test_candidate);
    } else {
      if (!fullName.toLocaleLowerCase().startsWith("test")) {
        return NextResponse.json({ error: "Student name, class or roll number was not found. For a camera test, use a test name such as ‘testing’." }, { status: 401 });
      }

      // Keep camera test identities in their own class namespace, even if the real class already uses this roll number.
      resolvedGroupId = `camera-test:${groupId}`;
      resolvedClassSlug = `camera-test-${classSlug}`;
      resolvedClassName = `${String(group.name)} (TEST)`;
      const existingTestRoster = await db.collection("studentRoster").findOne({ exam_group_id: resolvedGroupId, roll_number: rollNumber });
      const existingTestStudent = await db.collection("students").findOne({ exam_group_id: resolvedGroupId, roll_number: rollNumber });
      if (existingTestRoster || existingTestStudent) {
        const existingName = String(existingTestRoster?.full_name ?? existingTestStudent?.full_name ?? "").trim();
        if (!(existingTestRoster?.test_candidate || existingTestStudent?.test_candidate) || existingName.toLocaleLowerCase() !== fullName.toLocaleLowerCase()) {
          return NextResponse.json({ error: "This test class and roll number already belong to a different test student." }, { status: 409 });
        }
        roster = existingTestRoster;
        student = existingTestStudent;
      } else {
        const studentId = `test-student:${randomUUID()}`;
        const studentCode = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
        const createdAt = new Date();
        const identity = {
          exam_group_id: resolvedGroupId, source_exam_group_id: groupId, roll_number: rollNumber, full_name: fullName, board: resolvedBoard,
          test_class_name: String(group.name), test_class_slug: classSlug, authoritative: true, test_candidate: true,
          created_at: createdAt, created_by: "camera-test-login",
        };
        await db.collection("students").insertOne({
          _id: studentId, id: studentId, profile_id: studentId, student_code: studentCode,
          ...identity, active: true,
        });
        try {
          await db.collection("studentRoster").insertOne({ _id: studentId, id: studentId, ...identity });
        } catch (error) {
          await db.collection("students").deleteOne({ _id: studentId });
          throw error;
        }
        student = { _id: studentId, id: studentId, ...identity, student_code: studentCode };
        roster = { _id: studentId, id: studentId, ...identity };
      }
      isTestCandidate = true;
    }

    const registeredName = String(roster?.full_name ?? student?.full_name ?? fullName);
    const session = createStudentSession({ fullName: registeredName, rollNumber, classSlug: resolvedClassSlug, className: resolvedClassName, groupId: resolvedGroupId, board: String(roster?.board ?? student?.board ?? resolvedBoard) });
    const response = NextResponse.json({ ok: true, testCandidate: isTestCandidate, student: { fullName: registeredName, classSlug: resolvedClassSlug, className: resolvedClassName, rollNumber } });
    response.cookies.set(studentSessionCookieName, session.token, studentSessionCookieOptions(session.maxAge));
    return response;
  } catch (error) {
    console.error("MongoDB student sign-in failed:", error);
    return NextResponse.json({ error: "Unable to sign in at this time. Please try again in a few moments." }, { status: 503 });
  }
}
