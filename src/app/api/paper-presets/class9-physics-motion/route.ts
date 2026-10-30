import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { class9PhysicsMotionPaper } from "@/lib/server/class9-physics-motion-paper";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!getTeacherSession(request)) return NextResponse.json({ error: "Teacher sign-in required" }, { status: 401 });
  return NextResponse.json({ title: "Class 9 Physics — Motion", subject: "Physics", chapter_name: "Motion", group_slug: "class-9", duration_minutes: 45, passing_marks: 20, questions: class9PhysicsMotionPaper }, { headers: { "Cache-Control": "private, no-store" } });
}
