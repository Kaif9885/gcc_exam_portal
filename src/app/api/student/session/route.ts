import { NextResponse, type NextRequest } from "next/server";
import { getStudentSession, studentSessionCookieName, studentSessionCookieOptions } from "@/lib/server/student-session";

export async function GET(request: NextRequest) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  return NextResponse.json({ student: { fullName: session.fullName, rollNumber: session.rollNumber, classSlug: session.classSlug, className: session.className, board: session.board } });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(studentSessionCookieName, "", studentSessionCookieOptions(0));
  return response;
}
