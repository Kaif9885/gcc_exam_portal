import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession, studentSessionCookieName, studentSessionCookieOptions } from "@/lib/server/student-session";
import { CAMERA_TEST_EXAM_ID } from "@/lib/server/camera-test-exam";

export async function GET(request: NextRequest) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  return NextResponse.json({ student: { fullName: session.fullName, rollNumber: session.rollNumber, classSlug: session.classSlug, className: session.className, board: session.board } });
}

export async function DELETE(request: NextRequest) {
  const session = getStudentSession(request);
  if (session) {
    try {
      const db = await getMongoDb();
      const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber, test_candidate: true });
      if (student) {
        const studentId = String(student.id ?? student._id);
        const attempts = await db.collection("examAttempts").find({ student_id: studentId, exam_id: CAMERA_TEST_EXAM_ID }).toArray();
        const attemptIds = attempts.map(attempt => String(attempt.id ?? attempt._id));
        await Promise.all([
          db.collection("examAttempts").deleteMany({ student_id: studentId, exam_id: CAMERA_TEST_EXAM_ID }),
          db.collection("results").deleteMany({ student_id: studentId, exam_id: CAMERA_TEST_EXAM_ID }),
          db.collection("studentAnswers").deleteMany({ attempt_id: { $in: attemptIds } }),
          db.collection("examVideoSignals").deleteMany({ attempt_id: { $in: attemptIds } }),
          db.collection("examWarnings").deleteMany({ attempt_id: { $in: attemptIds } }),
        ]);
      }
    } catch (error) {
      console.error("Test student session reset failed:", error instanceof Error ? error.name : "UnknownError");
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(studentSessionCookieName, "", studentSessionCookieOptions(0));
  return response;
}
