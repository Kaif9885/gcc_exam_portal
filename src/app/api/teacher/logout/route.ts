import { NextResponse, type NextRequest } from "next/server";
import { teacherSessionCookieName, teacherSessionCookieOptions } from "@/lib/server/teacher-session";

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(teacherSessionCookieName, "", teacherSessionCookieOptions(0));
  return response;
}
