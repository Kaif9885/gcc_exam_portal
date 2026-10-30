import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";

export async function GET(request: NextRequest) {
  const session = getTeacherSession(request);
  if (!session) return NextResponse.json({ error: "Teacher session required" }, { status: 401 });
  return NextResponse.json({ teacherName: session.name, mode: session.mode });
}
