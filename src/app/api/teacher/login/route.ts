import { NextResponse, type NextRequest } from "next/server";
import { approvedTeacherNames, createTeacherSession, teacherSessionCookieName, teacherSessionCookieOptions } from "@/lib/server/teacher-session";

export async function POST(request: NextRequest) {
  let body: { teacherName?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }

  const teacherNameInput = (body.teacherName ?? "").trim();
  const name = approvedTeacherNames.find(item => item.toLowerCase() === teacherNameInput.toLowerCase());
  const sharedPassword = process.env.TEACHER_LOGIN_PASSWORD || "786";

  if (!name) {
    return NextResponse.json({ error: "Please select an approved faculty member name." }, { status: 400 });
  }

  if (!body.password || body.password !== sharedPassword) {
    return NextResponse.json({ error: "Incorrect teacher password." }, { status: 401 });
  }

  try {
    const session = createTeacherSession(name, "all");
    const response = NextResponse.json({ ok: true, teacherName: name });
    response.cookies.set(teacherSessionCookieName, session.token, teacherSessionCookieOptions(session.maxAge));
    return response;
  } catch {
    return NextResponse.json({ error: "Teacher session is not configured. Check TEACHER_SESSION_SECRET." }, { status: 503 });
  }
}
