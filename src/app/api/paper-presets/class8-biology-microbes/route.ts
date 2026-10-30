import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { class8BiologyMicrobesPaper } from "@/lib/server/class8-biology-microbes-paper";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!getTeacherSession(request)) return NextResponse.json({ error: "Teacher sign-in required" }, { status: 401 });
  return NextResponse.json({ title: "Class 8 Biology — Microbes: Friend and Foe", subject: "Biology", chapter_name: "Microbes: Friend and Foe", group_slug: "class-8", duration_minutes: 45, passing_marks: 20, questions: class8BiologyMicrobesPaper }, { headers: { "Cache-Control": "private, no-store" } });
}
